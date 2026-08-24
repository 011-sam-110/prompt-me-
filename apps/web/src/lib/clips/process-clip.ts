// The async post-upload step ENGINEERING_SPEC.md §4/§12 describes: "On
// successful upload: enqueue transcription (Whisper) and moderation (frame
// sampling + transcript check) before moderation_status flips to approved."
//
// Runs transcription, then moderation over the transcript and (for a
// video-tier clip) sampled frames, and only then decides the clip's final
// `moderation_status` — "approved" only once every check comes back clean,
// "pending_review" the moment anything is flagged (§12: "Any flag above
// threshold sets moderation_status = pending_review ... a clean scan sets
// approved immediately"). Mirrors how lib/verification/run-check.ts and
// lib/clips/upload.ts each compose @prompt-me/core + @prompt-me/db for
// their own milestone.
//
// Not wired to a real background job queue — none exists anywhere in this
// stack yet (ENGINEERING_SPEC §1 lists no queue provider), so there's
// nothing to enqueue *onto*. The engineering default that unblocks the
// build without one: the upload endpoint (api/clips/route.ts) calls this
// function without awaiting it, so it runs after the HTTP response instead
// of before it — "enqueue" in the loosest honest sense. A real durable
// queue (so a crashed server doesn't just drop an in-flight clip) is a
// fair follow-up once a queue provider is chosen; flagged, not hidden.
import {
  CLIP_TIER_SPECS,
  computeFrameSampleTimestamps,
  getClipStorageAdapter,
  getModerationProvider,
  getTranscriptionProvider,
  getVideoFrameSampler,
  isValidClipTier,
  type ModerationCheckOutput,
} from "@prompt-me/core";
import {
  getClipById,
  insertModerationFlag,
  updateClipModerationStatus,
  updateClipTranscript,
  type AnyDb,
  type Clip,
} from "@prompt-me/db";

/**
 * Confidence threshold above which a moderation category counts as a real
 * flag rather than noise — ENGINEERING_SPEC §12's "any flag above
 * threshold" isn't given a specific number in the spec. 0.5 is the
 * engineering default (OpenAI's own moderation docs treat 0.5 as the
 * boundary their `flagged` booleans are derived from) — named as its own
 * constant so a future revision is a one-line change, same rationale as
 * ../../../../../packages/core/src/clips/tiers.ts's
 * CLIP_DURATION_TOLERANCE_SECONDS.
 */
export const MODERATION_FLAG_THRESHOLD = 0.5;

/**
 * A clip's content type isn't persisted on the `clips` row (engineering
 * default: no recording UI exists yet with a real codec choice to persist
 * — see ROADMAP.md M4's build log). Post-upload processing infers a
 * reasonable default from the tier's format (SPEC.md §2's audio/video
 * split) rather than guessing per-clip: MediaRecorder in the browser that
 * will eventually record these defaults to WebM for both audio and video.
 * This is a parsing/demuxer hint only (mirrors duration-probe.ts's own
 * "mismatched hint falls back to sniffing" stance) — it never gates
 * anything security- or business-relevant, unlike duration, which is
 * always server-measured from the real bytes.
 */
function inferMimeType(tier: Clip["tier"]): string {
  if (!isValidClipTier(tier)) {
    throw new Error(`processClipUpload: invalid tier ${tier} on stored clip`);
  }
  return CLIP_TIER_SPECS[tier].format === "audio" ? "audio/webm" : "video/webm";
}

/**
 * Runs one moderation check's output against MODERATION_FLAG_THRESHOLD,
 * recording a `moderation_flags` row for every category that trips it.
 * Returns whether *anything* was flagged, so the caller can decide the
 * clip's overall status.
 */
async function recordModerationResult(
  db: AnyDb,
  clipId: string,
  result: ModerationCheckOutput,
): Promise<boolean> {
  let anyFlagged = false;
  for (const category of result.categories) {
    if (category.flagged && category.score >= MODERATION_FLAG_THRESHOLD) {
      anyFlagged = true;
      await insertModerationFlag(db, {
        clipId,
        flagType: category.category,
        confidence: category.score,
      });
    }
  }
  return anyFlagged;
}

/**
 * The actual pipeline: transcribe, then moderate the transcript and (for a
 * video tier) sampled frames, then persist the final moderation_status.
 * Safe to call more than once for the same clip (each step just
 * overwrites/re-derives its own result) — there's no queue infra yet to
 * guarantee at-most-once delivery, so idempotency is a property of the
 * function itself rather than something a queue promises on its behalf.
 */
export async function processClipUpload(db: AnyDb, clipId: string): Promise<Clip> {
  const clip = await getClipById(db, clipId);
  if (!clip) {
    throw new Error(`processClipUpload: no clip found for id=${clipId}`);
  }

  const mimeType = inferMimeType(clip.tier);
  const storage = getClipStorageAdapter();
  const data = await storage.download(clip.storageUrl);

  // ENGINEERING_SPEC §4/§1: Whisper, real or the dev-mock fallback.
  const transcription = await getTranscriptionProvider().transcribe({ data, mimeType });
  await updateClipTranscript(db, clip.id, transcription.transcript);

  // ENGINEERING_SPEC §12: transcript always moderated; sampled frames only
  // for a video tier (SPEC.md §2: tier 1 is audio-only, nothing to sample).
  const moderation = getModerationProvider();
  let flagged = false;

  const textResult = await moderation.moderate({ type: "text", text: transcription.transcript });
  if (await recordModerationResult(db, clip.id, textResult)) flagged = true;

  if (CLIP_TIER_SPECS[clip.tier as 1 | 2 | 3 | 4].format === "video") {
    const timestampsSeconds = computeFrameSampleTimestamps(clip.durationSeconds);
    const frames = await getVideoFrameSampler().sample({ data, mimeType, timestampsSeconds });
    for (const frame of frames) {
      const frameResult = await moderation.moderate({ type: "image", imageDataUrl: frame });
      if (await recordModerationResult(db, clip.id, frameResult)) flagged = true;
    }
  }

  return updateClipModerationStatus(db, clip.id, flagged ? "pending_review" : "approved");
}

/**
 * Fire-and-forget entry point for the upload endpoint — never awaited by
 * the HTTP response (see this file's top comment). Failures are logged,
 * not thrown into the void: a clip that errors out mid-processing is left
 * at "processing" rather than silently and incorrectly becoming
 * "approved", so it's visibly stuck rather than wrongly live.
 */
export function enqueueClipProcessing(db: AnyDb, clipId: string): void {
  processClipUpload(db, clipId).catch((error: unknown) => {
    console.error(`enqueueClipProcessing: failed for clipId=${clipId}`, error);
  });
}
