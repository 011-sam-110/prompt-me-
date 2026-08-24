// The composition point for SPEC.md §5's Escape action: "Escape: available
// any time from DatesInPlanning onward. One tap = unmatch + permanent
// block... the only way out of a live match — there's no messaging to say
// 'this isn't working,' so this has to be unambiguous." Mirrors
// check-and-create-match.ts's shape exactly: canonicalize the pair with the
// same @prompt-me/core helper M7's match-detection half already uses, then
// delegate the actual write to @prompt-me/db.
//
// Canonicalizing here (rather than trusting a caller to already know which
// of the two ids is userAId) is what makes this "a single action" whichever
// of the two matched users taps Escape — check-and-create-match.ts's own
// comment on canonicalizeMatchPair applies identically here: the pair
// always collapses onto the one matches row that exists for it, regardless
// of call order.
import { canonicalizeMatchPair } from "@prompt-me/core";
import { blockMatch, type AnyDb, type Match } from "@prompt-me/db";

/**
 * Blocks the match between `actingUserId` (whoever tapped Escape) and
 * `otherUserId`. Idempotent — re-tapping (or a retried/double-submitted
 * request) against an already-blocked pair succeeds and returns the same
 * blocked row rather than erroring (queries/matches.ts's blockMatch).
 * Throws MatchNotFoundError if no matches row exists between the pair at
 * all: Escape only exists once a match already does.
 */
export async function escapeMatch(db: AnyDb, actingUserId: string, otherUserId: string): Promise<Match> {
  const { userAId, userBId } = canonicalizeMatchPair(actingUserId, otherUserId);
  return blockMatch(db, { userAId, userBId });
}
