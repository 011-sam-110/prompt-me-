// The composition point for ENGINEERING_SPEC.md §10's pipeline: "pull both
// matched users' clips.transcript -> single Claude call with both
// transcript sets + the match's shared geohash cell -> two generated ideas
// + a one-line rationale each, written to date_ideas_generated." Also the
// caching rule from the same section: "Regenerated once per match (not per
// proposal)... a manual 'suggest new ideas' action can force regeneration."
//
// Mirrors lib/date-proposals/get-match-proposals.ts's shape: reuse
// match-access.ts's shared participant/active-match guard rather than a
// second copy of it, and let @prompt-me/core's/db's own pieces do the real
// work — this file only wires them together in the right order.
import {
  getClipsForUserInUploadOrder,
  getLatestGeneratedIdeasForMatch,
  getUserById,
  insertGeneratedDateIdeas,
  type AnyDb,
  type DateIdeaGenerated,
} from "@prompt-me/db";
import { getDateIdeaGeneratorProvider, sharedGeohashCell } from "@prompt-me/core";
import { assertActiveMatchParticipant } from "../date-proposals/match-access";

export interface GetOrGenerateIdeasOptions {
  /** ROADMAP.md M10's "suggest new ideas" action — skips the cache read
   * entirely and always calls the generator provider for a fresh pair. */
  forceRegenerate?: boolean;
}

/**
 * Returns the match's current pair of generated ideas — from cache
 * (`date_ideas_generated`) whenever one already exists and
 * `forceRegenerate` isn't set, otherwise by calling the active
 * @prompt-me/core date-idea generator provider (dev-mock or real Claude,
 * get-provider.ts's own switch) and persisting the fresh pair. Called
 * directly from the calendar page's server component on first render
 * (rather than only from a server action) — the same "get-or-create as a
 * render-time side effect" shape queries/users.ts's ensureUserForClerkId
 * already establishes for this codebase, so a match's first visit to the
 * planning page is what lazily triggers its first generation, and every
 * later visit reads the cache.
 */
export async function getOrGenerateIdeas(
  db: AnyDb,
  matchId: string,
  viewerId: string,
  options: GetOrGenerateIdeasOptions = {},
): Promise<DateIdeaGenerated[]> {
  const match = await assertActiveMatchParticipant(db, matchId, viewerId);

  if (!options.forceRegenerate) {
    const cached = await getLatestGeneratedIdeasForMatch(db, matchId);
    if (cached.length === 2) {
      return cached;
    }
  }

  const [userA, userB] = await Promise.all([getUserById(db, match.userAId), getUserById(db, match.userBId)]);
  if (!userA || !userB) {
    // Only reachable if a users row were deleted out from under an existing
    // matches row — matches.ts's own FK references make this a data
    // integrity problem, not a normal runtime path, so this surfaces loudly
    // rather than silently generating ideas for a half-missing pair.
    throw new Error(`getOrGenerateIdeas: matchId=${matchId} references a missing user`);
  }

  const [clipsA, clipsB] = await Promise.all([
    getClipsForUserInUploadOrder(db, userA.id),
    getClipsForUserInUploadOrder(db, userB.id),
  ]);

  const provider = getDateIdeaGeneratorProvider();
  const output = await provider.generate({
    // A clip whose async transcription (ENGINEERING_SPEC §4) hasn't landed
    // yet has `transcript: null` — simply left out, not passed through as
    // an empty string or blocking the call.
    transcriptsA: clipsA.map((clip) => clip.transcript).filter((t): t is string => t !== null),
    transcriptsB: clipsB.map((clip) => clip.transcript).filter((t): t is string => t !== null),
    sharedGeohashCell: sharedGeohashCell(userA.geohash5, userB.geohash5),
  });

  if (!options.forceRegenerate) {
    // Double-checked read, right before the write this time: the provider
    // call just above is the dominant source of a gap two concurrent
    // *first-ever* requests for this match could land in (e.g. a client
    // navigating to this page while an earlier prefetch of the same route
    // is still in flight — components/matches's own Link now opts out of
    // prefetching this route for exactly this reason, so this is a
    // second, cheaper line of defense for it, not the only one). This
    // narrows the race window; it is not a hard atomicity guarantee — a
    // truly simultaneous pair of requests can still both pass this check
    // before either has written (Postgres's default READ COMMITTED
    // isolation doesn't lock against a row that doesn't exist yet, so a
    // real guarantee would need a unique-constraint-backed insert the way
    // queries/matches.ts's insertMatchIfNotExists uses one — out of scope
    // here without a schema change `date_ideas_generated`'s own header
    // comment argues against, since it exists specifically to hold
    // multiple historical batches per match). What IS guaranteed either
    // way: getLatestGeneratedIdeasForMatch's own deterministic ordering
    // means every read after any race settles converges on the exact same
    // single pair (get-or-generate-ideas.test.ts's own "converge" case) —
    // worst case, a rare true-simultaneous race costs one wasted provider
    // call and leaves a harmless extra history row, never a
    // reader-visible inconsistency. `forceRegenerate` skips this check on
    // purpose — a fresh pair is the intended outcome there regardless of
    // what's cached.
    const stillCached = await getLatestGeneratedIdeasForMatch(db, matchId);
    if (stillCached.length === 2) {
      return stillCached;
    }
  }

  return insertGeneratedDateIdeas(db, matchId, output.ideas);
}

export { DateProposalMatchAccessError, DateProposalMatchNotActiveError } from "../date-proposals/match-access";
