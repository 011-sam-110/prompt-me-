// The actual review action ROADMAP.md M12's human-review queue performs:
// "actions to approve or take down the flagged content." One entry point
// per `moderation_flags` row, composing @prompt-me/core's pure
// deriveClipModerationStatusAfterReview with @prompt-me/db's mechanical
// queries — same "core decides, this composes" split
// lib/clips/process-clip.ts already uses for the automated first pass;
// this is that pipeline's human-in-the-loop counterpart.
import { deriveClipModerationStatusAfterReview } from "@prompt-me/core";
import {
  getModerationFlagById,
  getModerationFlagsForClip,
  markModerationFlagReviewed,
  removeChatMessage,
  updateClipModerationStatus,
  type AnyDb,
  type ModerationFlag,
} from "@prompt-me/db";

export class ModerationFlagNotFoundError extends Error {
  constructor(flagId: string) {
    super(`reviewModerationFlag: no moderation_flags row for id=${flagId}`);
    this.name = "ModerationFlagNotFoundError";
  }
}

/**
 * Re-derives and persists a clip's overall `moderation_status` from the
 * *current* full set of flags recorded against it — always re-read fresh
 * rather than assembled from what the caller already had in hand, so two
 * reviewers acting on two different flags for the same clip in quick
 * succession each still land on the true combined outcome (core's own
 * function is a pure fold over whatever flag set it's given; the
 * correctness here is entirely about re-reading before folding).
 */
async function applyClipStatusForFlag(db: AnyDb, clipId: string): Promise<void> {
  const flags = await getModerationFlagsForClip(db, clipId);
  const outcome = deriveClipModerationStatusAfterReview(flags);
  await updateClipModerationStatus(db, clipId, outcome);
}

/**
 * Shared by both actions below — everything except *which* action_taken
 * gets written is identical: look the flag up (404-shaped for a bad id),
 * record the decision, then apply whatever follow-on effect that target
 * kind needs. Idempotent by construction (queries/moderation.ts's
 * markModerationFlagReviewed's own doc comment): reviewing the same flag
 * twice — a double-click, two reviewers racing — just re-applies the
 * decision and re-derives the clip status from the current flag set
 * either way, never errors.
 */
async function reviewFlag(db: AnyDb, flagId: string, action: "cleared" | "removed"): Promise<ModerationFlag> {
  const existing = await getModerationFlagById(db, flagId);
  if (!existing) {
    throw new ModerationFlagNotFoundError(flagId);
  }

  const flag = await markModerationFlagReviewed(db, flagId, action);

  if (flag.clipId) {
    // A clip's visibility is gated by moderation_status, not by any one
    // flag's own reviewed bit — always recompute from the full set (this
    // covers both "approve" and "take down": a "removed" action already
    // makes deriveClipModerationStatusAfterReview return "rejected" on its
    // own, so there's no need for a second, separate rejection path here).
    await applyClipStatusForFlag(db, flag.clipId);
  } else if (flag.chatMessageId && action === "removed") {
    // A chat message has no moderation_status to gate visibility with
    // (ENGINEERING_SPEC §12: chat moderation never blocks anything) — "take
    // down" here means soft-removing the message content itself.
    // Clearing a chat flag has no further effect: the message was already
    // delivered and stays that way, exactly as §12 intends.
    await removeChatMessage(db, flag.chatMessageId);
  }

  return flag;
}

/** The review queue's "Approve" action — clears one flag. */
export function approveModerationFlag(db: AnyDb, flagId: string): Promise<ModerationFlag> {
  return reviewFlag(db, flagId, "cleared");
}

/** The review queue's "Take down" action — confirms one flag as a real
 * violation and removes the content it targets (clip → rejected and
 * invisible; chat message → soft-removed, ENGINEERING_SPEC §12). */
export function takeDownModerationFlag(db: AnyDb, flagId: string): Promise<ModerationFlag> {
  return reviewFlag(db, flagId, "removed");
}
