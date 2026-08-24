// Shared moderation-flag recording — ENGINEERING_SPEC.md §12. Used by both
// the clip pipeline (lib/clips/process-clip.ts, ROADMAP.md M4) and the
// chat-message pipeline (lib/chat/process-chat-message.ts, ROADMAP.md
// M12): both run a @prompt-me/core ModerationCheckOutput through the exact
// same above-threshold decision and the exact same "one moderation_flags
// row per tripped category" write, just against a different target kind
// (a clip vs. a chat message) — pulled out into its own module once M12
// needed the identical logic a second time rather than a second copy of
// it (this file used to live inline in process-clip.ts).
import type { ModerationCheckOutput } from "@prompt-me/core";
import { insertModerationFlag, type AnyDb, type InsertModerationFlagInput } from "@prompt-me/db";

/**
 * Confidence threshold above which a moderation category counts as a real
 * flag rather than noise — ENGINEERING_SPEC §12's "any flag above
 * threshold" isn't given a specific number in the spec. 0.5 is the
 * engineering default (OpenAI's own moderation docs treat 0.5 as the
 * boundary their `flagged` booleans are derived from) — named as its own
 * constant so a future revision is a one-line change, same rationale as
 * packages/core/src/clips/tiers.ts's CLIP_DURATION_TOLERANCE_SECONDS.
 */
export const MODERATION_FLAG_THRESHOLD = 0.5;

/** Exactly one of `clipId`/`chatMessageId` is expected to be set, matching
 * the schema's own moderation_flags_target_xor CHECK — see
 * insertModerationFlag's own doc comment; this function doesn't re-verify
 * that itself either. */
export type ModerationFlagTarget = Pick<InsertModerationFlagInput, "clipId" | "chatMessageId">;

/**
 * Runs one moderation check's output against MODERATION_FLAG_THRESHOLD,
 * recording a `moderation_flags` row for every category that trips it,
 * against whichever target the caller names. Returns whether *anything*
 * was flagged, so the caller can decide what (if anything) to do next —
 * lib/clips/process-clip.ts uses that to decide the clip's
 * moderation_status; lib/chat/process-chat-message.ts has nothing to gate
 * on it for (ENGINEERING_SPEC §12: chat moderation never blocks send), it
 * just lets the flag rows themselves feed ROADMAP.md M12's review queue.
 */
export async function recordModerationResult(
  db: AnyDb,
  target: ModerationFlagTarget,
  result: ModerationCheckOutput,
): Promise<boolean> {
  let anyFlagged = false;
  for (const category of result.categories) {
    if (category.flagged && category.score >= MODERATION_FLAG_THRESHOLD) {
      anyFlagged = true;
      await insertModerationFlag(db, {
        ...target,
        flagType: category.category,
        confidence: category.score,
      });
    }
  }
  return anyFlagged;
}
