// The human-review-queue decision ENGINEERING_SPEC.md §12 / ROADMAP.md M12
// need for a *clip*: "a flagged clip stays invisible until a human review
// action clears it." A clip can carry more than one moderation_flags row —
// one per flagged category per moderation call (packages/db's
// moderation.ts's own header comment: "one row per flagged category per
// moderation call") — so reviewing a single flag doesn't automatically
// resolve what the *clip's* overall moderation_status should become; this
// is the pure, DB-free decision for that, given the full set of flags
// recorded against one clip after one of them has just been reviewed.
// Same "core decides, db persists" split as rewatch/access.ts's
// evaluateRewatchAccess — apps/web's lib/moderation/review-flag.ts
// composes this with @prompt-me/db's clip/flag queries.

/** The subset of a `moderation_flags` row this decision needs — deliberately
 * structural (any object with these two fields works, so a real
 * @prompt-me/db `ModerationFlag` row satisfies this with no adapting). */
export interface ModerationFlagReviewSnapshot {
  reviewed: boolean;
  actionTaken: "cleared" | "removed" | null;
}

export type ClipModerationOutcome = "approved" | "pending_review" | "rejected";

/**
 * `"removed"` is sticky/terminal: once any one flag against a clip has been
 * confirmed as a real violation, the clip stays rejected even if a sibling
 * flag (a different flagged category, or a different sampled frame) is
 * separately cleared — clearing one category was never a claim that the
 * *other* flagged content was fine too. Checked first and independent of
 * review-completeness, so a `"removed"` verdict never gets masked by an
 * unreviewed flag elsewhere on the same clip.
 *
 * Short of that, the clip only returns to `"approved"` once every recorded
 * flag has been reviewed and none of them were removed; any flag still
 * awaiting a decision keeps it at `"pending_review"` — exactly the state
 * apps/web's lib/clips/process-clip.ts put it in on the initial automated
 * scan.
 *
 * Order-independent and idempotent by construction: this is a pure
 * function of the *current* full flag set, not of which flag was reviewed
 * most recently, so calling it again after a second, third, etc. review on
 * the same clip always reflects the true current state.
 */
export function deriveClipModerationStatusAfterReview(
  flags: ModerationFlagReviewSnapshot[],
): ClipModerationOutcome {
  if (flags.some((flag) => flag.actionTaken === "removed")) {
    return "rejected";
  }
  if (flags.every((flag) => flag.reviewed)) {
    return "approved";
  }
  return "pending_review";
}
