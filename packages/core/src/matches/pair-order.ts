// schema/matches.ts's own header comment: "`user_a_id`/`user_b_id` are
// unordered in principle... the app layer is responsible for always
// inserting them in a canonical order (e.g. lexicographically smaller UUID
// first) so the `unique(user_a_id, user_b_id)` index actually catches a
// duplicate pair regardless of which side initiated the match." This is
// that canonicalization, kept here (pure, DB-free) rather than in
// packages/db, matching every other query file's "the rule lives in core,
// the query is mechanical" split — packages/db/src/queries/matches.ts's
// insertMatchIfNotExists takes an already-ordered pair and does no
// ordering of its own.

export interface CanonicalMatchPair {
  userAId: string;
  userBId: string;
}

/**
 * Orders two user ids the same way regardless of which order they're
 * passed in, so `canonicalizeMatchPair(x, y)` and
 * `canonicalizeMatchPair(y, x)` always produce the identical
 * `{ userAId, userBId }` — the property the `matches` table's unique pair
 * index (schema/matches.ts) relies on to dedupe a match regardless of which
 * user's clip_views write triggered its creation.
 */
export function canonicalizeMatchPair(userIdX: string, userIdY: string): CanonicalMatchPair {
  return userIdX < userIdY
    ? { userAId: userIdX, userBId: userIdY }
    : { userAId: userIdY, userBId: userIdX };
}
