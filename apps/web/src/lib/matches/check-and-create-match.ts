// The composition point ENGINEERING_SPEC.md §7 describes: "Server-side, on
// every clip_views write, check whether the viewer has completed = true for
// every clip currently uploaded by the profile owner... When both
// directions are true..., create a matches row and remove both from each
// other's future feed candidate queries." Called from
// lib/clips/report-view-position.ts immediately after it persists a
// clip_views row — the literal "every clip_views write" trigger point —
// mirroring how lib/feed/get-feed.ts and lib/verification/run-check.ts each
// compose @prompt-me/core's pure rules with @prompt-me/db's mechanical
// queries for their own milestone.
//
// The "remove both from each other's future candidate queries" half needs
// no code here at all: packages/db/src/queries/feed.ts's
// getBaseCandidateUsers already excludes anyone sharing *any* `matches` row
// with the viewer, checked from both directions (its own header comment) —
// so the instant insertMatchIfNotExists below commits a row, M6's existing
// candidate query starts excluding this pair on its own.
//
// One-directional completion never reaches insertMatchIfNotExists: both
// hasCompletedAllClips calls below have to return true before this function
// gets anywhere near creating a match, and it returns null the moment
// either one doesn't — there is no path through this file that creates a
// matches row from less than full completion on both sides.
import { canonicalizeMatchPair, hasCompletedAllClips } from "@prompt-me/core";
import {
  getClipIdsForUser,
  getCompletedClipIdsForViewerAndProfile,
  insertMatchIfNotExists,
  type AnyDb,
  type ClipView,
  type Match,
} from "@prompt-me/db";

/**
 * `clipView` is the row lib/clips/report-view-position.ts just wrote or
 * updated. Returns the match (newly created, or the one that already
 * existed if this pair had already matched) once both directions are fully
 * complete, or `null` for the ordinary case — most writes don't complete a
 * clip at all, let alone every clip on both sides of a pair.
 */
export async function checkAndCreateMatchIfMutual(db: AnyDb, clipView: ClipView): Promise<Match | null> {
  const { viewerId, profileUserId } = clipView;

  // Defensive only: the real upload/feed paths never let a viewer's own
  // profile reach them as a "candidate" to watch (M6's candidate query
  // excludes self) and `matches` has a DB-level check forbidding a
  // self-match (schema/matches.ts's matches_no_self_match) — this just
  // avoids ever reaching that constraint violation from here, e.g. if a
  // signed-in owner directly opens their own clip's playback URL (the M5
  // harness page's own comment notes that page doesn't gate this).
  if (viewerId === profileUserId) {
    return null;
  }

  // This specific write didn't reach the clip's end, so the viewer hasn't
  // completed *every* clip of this profile owner's either — nothing further
  // to check. (recordClipViewPosition never un-completes a row once it's
  // true, so this only short-circuits genuinely-incomplete reports, never a
  // stale rewind of an already-completed clip.)
  if (!clipView.completed) {
    return null;
  }

  const ownerClipIds = await getClipIdsForUser(db, profileUserId);
  const viewerCompletedOfOwner = await getCompletedClipIdsForViewerAndProfile(db, viewerId, profileUserId);
  if (!hasCompletedAllClips(ownerClipIds, viewerCompletedOfOwner)) {
    return null;
  }

  // Direction one holds — now check the reverse: has the profile owner, in
  // turn, completed every one of the *viewer's* clips? This is the "in BOTH
  // directions" half of §7; a viewer finishing an owner's entire stack says
  // nothing about whether the owner has ever watched the viewer back.
  const viewerClipIds = await getClipIdsForUser(db, viewerId);
  const ownerCompletedOfViewer = await getCompletedClipIdsForViewerAndProfile(db, profileUserId, viewerId);
  if (!hasCompletedAllClips(viewerClipIds, ownerCompletedOfViewer)) {
    return null;
  }

  const { userAId, userBId } = canonicalizeMatchPair(viewerId, profileUserId);
  return insertMatchIfNotExists(db, { userAId, userBId });
}
