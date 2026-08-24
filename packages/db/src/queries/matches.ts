// matches data access — ENGINEERING_SPEC.md §2/§7, ROADMAP.md M7.
// Mechanical only, same split as every other file in this directory: the
// actual "should a match exist" rule (mutual completion, both directions)
// is @prompt-me/core's hasCompletedAllClips, and the pair-ordering rule is
// @prompt-me/core's canonicalizeMatchPair — both composed with this file's
// insertMatchIfNotExists by apps/web's
// lib/matches/check-and-create-match.ts. This file does no ordering of its
// own: callers MUST already pass userAId/userBId in canonical order.
import { and, eq } from "drizzle-orm";
import { matches, type Match } from "../schema/matches";
import type { AnyDb } from "../types";

export interface InsertMatchInput {
  /** Must already be the lexicographically-smaller id of the pair —
   * @prompt-me/core's canonicalizeMatchPair produces this. */
  userAId: string;
  userBId: string;
}

/**
 * Idempotent insert — same "onConflictDoNothing, then fall back to a
 * select for the row that already exists" shape as queries/users.ts's
 * ensureUserForClerkId, targeting the table's own
 * `matches_user_pair_idx` unique index (schema/matches.ts) instead of
 * `users_clerk_id_idx`. Two clip_views writes racing each other (one from
 * each side of a pair, both discovering mutual completion at nearly the
 * same moment) settle on the same single row rather than one of them
 * hitting a constraint-violation error.
 */
export async function insertMatchIfNotExists(db: AnyDb, input: InsertMatchInput): Promise<Match> {
  const inserted = await db
    .insert(matches)
    .values({ userAId: input.userAId, userBId: input.userBId })
    .onConflictDoNothing({ target: [matches.userAId, matches.userBId] })
    .returning();

  if (inserted[0]) {
    return inserted[0];
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
      `insertMatchIfNotExists: insert conflicted but no row was found for userAId=${input.userAId}, userBId=${input.userBId}`,
    );
  }
  return existing;
}
