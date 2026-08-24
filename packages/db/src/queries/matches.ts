// matches data access — ENGINEERING_SPEC.md §2/§7, ROADMAP.md M7.
// Mechanical only, same split as every other file in this directory: the
// actual "should a match exist" rule (mutual completion, both directions)
// is @prompt-me/core's hasCompletedAllClips, and the pair-ordering rule is
// @prompt-me/core's canonicalizeMatchPair — both composed with this file's
// insertMatchIfNotExists by apps/web's
// lib/matches/check-and-create-match.ts. This file does no ordering of its
// own: callers MUST already pass userAId/userBId in canonical order.
import { and, eq, or } from "drizzle-orm";
import { matches, type Match } from "../schema/matches";
import type { AnyDb } from "../types";

export interface InsertMatchInput {
  /** Must already be the lexicographically-smaller id of the pair —
   * @prompt-me/core's canonicalizeMatchPair produces this. */
  userAId: string;
  userBId: string;
}

export interface InsertMatchResult {
  match: Match;
  /** True only when this call is the one that actually inserted the row —
   * false when a `matches` row for this pair already existed (whether from
   * an earlier genuine creation, or a same-pair race this call lost).
   * ROADMAP.md M13 / ENGINEERING_SPEC §14 needs exactly this distinction:
   * apps/web/src/lib/matches/check-and-create-match.ts only sends the
   * "new match" email when `created` is true — never on the repeat calls
   * every subsequent clip_views write for an already-matched pair makes
   * (this file's own header comment: recordClipViewPosition never
   * un-completes a row, so checkAndCreateMatchIfMutual keeps re-running
   * against an already-complete pair on every later write). */
  created: boolean;
}

/**
 * Idempotent insert — same "onConflictDoNothing, then fall back to a
 * select for the row that already exists" shape as queries/users.ts's
 * ensureUserForClerkId, targeting the table's own
 * `matches_user_pair_idx` unique index (schema/matches.ts) instead of
 * `users_clerk_id_idx`. Two clip_views writes racing each other (one from
 * each side of a pair, both discovering mutual completion at nearly the
 * same moment) settle on the same single row rather than one of them
 * hitting a constraint-violation error — and `created` tells the loser of
 * that race apart from the winner.
 */
export async function insertMatchAndReportCreated(db: AnyDb, input: InsertMatchInput): Promise<InsertMatchResult> {
  const inserted = await db
    .insert(matches)
    .values({ userAId: input.userAId, userBId: input.userBId })
    .onConflictDoNothing({ target: [matches.userAId, matches.userBId] })
    .returning();

  if (inserted[0]) {
    return { match: inserted[0], created: true };
  }

  const [existing] = await db
    .select()
    .from(matches)
    .where(and(eq(matches.userAId, input.userAId), eq(matches.userBId, input.userBId)));
  if (!existing) {
    // Only reachable if the row were deleted between the conflicting
    // insert and this select — surfaces loudly rather than silently
    // returning undefined to the caller (mirrors ensureUserForClerkId).
    throw new Error(
      `insertMatchAndReportCreated: insert conflicted but no row was found for userAId=${input.userAId}, userBId=${input.userBId}`,
    );
  }
  return { match: existing, created: false };
}

/**
 * Same insert as insertMatchAndReportCreated, minus the `created` flag —
 * kept as a thin wrapper (rather than changing this function's own return
 * type) so every existing caller across this codebase's test suite that
 * only ever wanted "give me a match row for this pair, creating it if
 * needed" (there are dozens — every other milestone's tests use this
 * purely as fixture setup) keeps compiling unchanged. New callers that
 * need to know whether a row was genuinely new (currently only
 * check-and-create-match.ts) use insertMatchAndReportCreated directly.
 */
export async function insertMatchIfNotExists(db: AnyDb, input: InsertMatchInput): Promise<Match> {
  const { match } = await insertMatchAndReportCreated(db, input);
  return match;
}

/**
 * Thrown by `blockMatch` when no `matches` row exists between the given
 * pair at all — Escape (SPEC.md §5) only ever exists once a match already
 * does ("available any time from DatesInPlanning onward"), so there is no
 * sensible "block a pair that never matched" outcome to fall back to.
 */
export class MatchNotFoundError extends Error {
  constructor(userAId: string, userBId: string) {
    super(`No matches row exists between userAId=${userAId} and userBId=${userBId}`);
    this.name = "MatchNotFoundError";
  }
}

export interface BlockMatchInput {
  /** Must already be canonically ordered — see this file's header comment
   * and @prompt-me/core's canonicalizeMatchPair. */
  userAId: string;
  userBId: string;
}

/**
 * SPEC.md §5's Escape: "One tap = unmatch + permanent block... the only way
 * out of a live match." A single, unconditional `UPDATE ... RETURNING`
 * against the pair's existing row — there is deliberately no "already
 * blocked?" read-then-write: setting an already-blocked row to `blocked`
 * again is a harmless no-op on the value that matters (`status` doesn't
 * change), so a double-submitted Escape tap (e.g. a retried request) is
 * idempotent by construction rather than needing its own branch, the same
 * shape `insertMatchIfNotExists` above gives idempotency to the *creation*
 * side of this table.
 *
 * This is the one edge of @prompt-me/core's full match-lifecycle model
 * (matches/lifecycle.ts) that's actually wired to a real write today: that
 * module's `ESCAPE_ELIGIBLE_STATES` names four persisted-as-"active" states
 * (DatesInPlanning/DateLocked/ChatOpen/ChatClosed) Escape may fire from,
 * but `matches.status` doesn't yet distinguish any of the four from each
 * other (see lifecycle.ts's own header comment) — so this function's actual
 * guard is "a matches row exists for this pair at all" (i.e. at or past
 * Matched), which correctly covers every one of those four sub-states with
 * the one column that exists today.
 *
 * Once this commits, two things are already true with no further code:
 *  - packages/db's getBaseCandidateUsers (feed.ts) excludes *any* matches
 *    row regardless of status, so the pair is instantly gone from the
 *    other's discovery feed too, permanently — no 48h clock, no resurfacing
 *    (feed.ts never even reads a "now"), unlike the 48h/0.3x denied-profile
 *    rule in packages/core/src/feed/ranking.ts, which only ever applies to
 *    `feed_decisions` rows, never to `matches`.
 *  - `getActiveMatchesForUser` below (the query a future planning UI, M9,
 *    would list a user's plannable matches from) stops returning this pair
 *    on its very next call — there is no separate cache or list to
 *    separately purge.
 */
export async function blockMatch(db: AnyDb, input: BlockMatchInput): Promise<Match> {
  const [updated] = await db
    .update(matches)
    .set({ status: "blocked", updatedAt: new Date() })
    .where(and(eq(matches.userAId, input.userAId), eq(matches.userBId, input.userBId)))
    .returning();

  if (!updated) {
    throw new MatchNotFoundError(input.userAId, input.userBId);
  }
  return updated;
}

/**
 * The query surface a future date-planning UI (M9) lists a user's
 * plannable matches from — `status = "active"` only, checked from either
 * side of the pair. Filtering at the query's own source (rather than a
 * cached list a separate action would have to remember to purge) is what
 * makes `blockMatch`'s "immediately removing the pair from any planning UI"
 * true structurally: the instant a row flips to `blocked`, this query never
 * returns it again, on its very next call, with no additional code — the
 * exact same reasoning packages/db's feed.ts already uses for the
 * candidate-query exclusion (that file's own header comment).
 */
export async function getActiveMatchesForUser(db: AnyDb, userId: string): Promise<Match[]> {
  return db
    .select()
    .from(matches)
    .where(and(eq(matches.status, "active"), or(eq(matches.userAId, userId), eq(matches.userBId, userId))));
}

/**
 * A single `matches` row by its own id, regardless of status —
 * apps/web's lib/rewatch/request-rewatch-access.ts (ROADMAP M8) uses this
 * to confirm the acting viewer is actually a participant in the match
 * they're requesting a rewatch session for, before touching
 * rewatch_sessions at all. Deliberately not filtered to `status = "active"`
 * the way getActiveMatchesForUser is — ENGINEERING_SPEC §8 doesn't gate
 * rewatch on match status, only on the rewatch_sessions clock, so this
 * stays a plain lookup and leaves that policy question to the caller.
 */
export async function getMatchById(db: AnyDb, matchId: string): Promise<Match | undefined> {
  const [row] = await db.select().from(matches).where(eq(matches.id, matchId));
  return row;
}
