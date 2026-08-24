// The composition point ROADMAP.md M4 (first half) actually runs: validates
// a clip upload against @prompt-me/core's pure rules (tier dependency,
// server-measured duration tolerance, prompt-selection XOR), then — only if
// every check passes — stores the bytes (@prompt-me/core's storage
// adapter) and persists the row (@prompt-me/db). Mirrors how
// lib/verification/run-check.ts composes core + db for M3.
//
// Deliberately does *not* enqueue transcription/moderation or flip
// moderation_status away from its "processing" default — ENGINEERING_SPEC
// §4's next paragraph ("enqueue transcription (Whisper) and moderation...
// before moderation_status flips to approved") is the second half of M4,
// out of scope here.
import {
  CLIP_TIER_SPECS,
  checkTierDependency,
  getClipStorageAdapter,
  isDurationWithinTolerance,
  isValidClipTier,
  probeClipDurationSeconds,
  validatePromptSelection,
  type ClipTier,
} from "@prompt-me/core";
import {
  ensurePromptsSeeded,
  getClipTiersForUser,
  getPromptById,
  insertClip,
  type AnyDb,
  type Clip,
} from "@prompt-me/db";

export interface ClipUploadInput {
  userId: string;
  /** Not yet narrowed to ClipTier — validated as the first step below. */
  tier: number;
  data: Uint8Array;
  /** The upload's declared content type — used for storage + as a parser
   * hint only, never trusted for the duration measurement itself. */
  mimeType: string;
  promptId?: string | null;
  customPromptText?: string | null;
}

export type ClipUploadError =
  | { code: "invalid_tier"; message: string }
  | { code: "tier_dependency"; message: string }
  | { code: "duration_out_of_range"; message: string; measuredDurationSeconds: number }
  | { code: "invalid_prompt_selection"; message: string };

export type ClipUploadResult = { ok: true; clip: Clip } | { ok: false; error: ClipUploadError };

export async function uploadClip(db: AnyDb, input: ClipUploadInput): Promise<ClipUploadResult> {
  if (!isValidClipTier(input.tier)) {
    return {
      ok: false,
      error: { code: "invalid_tier", message: `tier must be 1-4, got ${input.tier}` },
    };
  }
  const tier: ClipTier = input.tier;

  // SPEC.md §2 / ENGINEERING_SPEC §4: reject tier N unless tier N-1
  // already exists for this user (tier 1 has no dependency).
  const existingTiers = await getClipTiersForUser(db, input.userId);
  const dependency = checkTierDependency(existingTiers, tier);
  if (!dependency.ok) {
    return { ok: false, error: { code: "tier_dependency", message: dependency.reason! } };
  }

  // ENGINEERING_SPEC §4: measured from the actual uploaded bytes — the
  // client's own reported duration is never read anywhere in this path.
  const measuredDurationSeconds = await probeClipDurationSeconds(input.data, input.mimeType);
  if (!isDurationWithinTolerance(tier, measuredDurationSeconds)) {
    return {
      ok: false,
      error: {
        code: "duration_out_of_range",
        message:
          `tier ${tier} expects ~${CLIP_TIER_SPECS[tier].durationSeconds}s, ` +
          `measured ${measuredDurationSeconds.toFixed(2)}s`,
        measuredDurationSeconds,
      },
    };
  }

  // SPEC.md §2: curated prompt (by id) XOR a free-text custom prompt.
  await ensurePromptsSeeded(db);
  const resolvedPrompt = input.promptId ? await getPromptById(db, input.promptId) : null;
  const promptCheck = validatePromptSelection({
    tier,
    promptId: input.promptId,
    customPromptText: input.customPromptText,
    resolvedPrompt: resolvedPrompt
      ? { tier: resolvedPrompt.tier, isActive: resolvedPrompt.isActive }
      : null,
  });
  if (!promptCheck.ok) {
    return { ok: false, error: { code: "invalid_prompt_selection", message: promptCheck.reason! } };
  }

  // Only now — after every rejection path above — do we actually store
  // anything (ENGINEERING_SPEC §1: Vercel Blob, real or the dev-mock
  // fallback per get-adapter.ts).
  const storage = getClipStorageAdapter();
  const key = `clips/${input.userId}/tier-${tier}-${crypto.randomUUID()}`;
  const { url } = await storage.upload({ key, data: input.data, contentType: input.mimeType });

  const clip = await insertClip(db, {
    userId: input.userId,
    tier,
    durationSeconds: measuredDurationSeconds,
    storageUrl: url,
    promptId: input.promptId ?? null,
    customPromptText: input.customPromptText ?? null,
  });

  return { ok: true, clip };
}
