// ENGINEERING_SPEC.md §7: "Server-side, on every clip_views write, check
// whether the viewer has completed = true for every clip currently
// uploaded by the profile owner. When both directions are true... create a
// matches row." Pure predicate, DB-free — mirrors clips/dependency.ts's
// split of "the rule" from "the query that gathers its inputs": the actual
// "what clips does this user have" / "which of them has this viewer
// completed" lookups live in packages/db (queries/clips.ts's
// getClipIdsForUser, queries/clip-views.ts's
// getCompletedClipIdsForViewerAndProfile), composed with this function by
// apps/web's lib/matches/check-and-create-match.ts — the same shape
// dependency.ts/upload.ts already draw for the upload side.

/**
 * Has `completedClipIds` covered every id in `ownerClipIds`? One direction
 * of §7's mutual check — the caller runs this twice (owner's clips against
 * the viewer's completions, then the reverse) and only creates a match when
 * both calls return true.
 *
 * A profile with zero clips uploaded (`ownerClipIds.length === 0`) returns
 * `false` rather than vacuously `true`: there is nothing to have completed,
 * so "completed everything" can't be satisfied by an owner who hasn't
 * uploaded anything yet — this is what stops, e.g., a freshly-onboarded
 * user with no clips from instantly "matching" anyone who merely visits
 * their (clipless) profile.
 */
export function hasCompletedAllClips(
  ownerClipIds: readonly string[],
  completedClipIds: ReadonlySet<string>,
): boolean {
  if (ownerClipIds.length === 0) {
    return false;
  }
  return ownerClipIds.every((clipId) => completedClipIds.has(clipId));
}
