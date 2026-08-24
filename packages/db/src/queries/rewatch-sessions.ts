// rewatch_sessions data access — ENGINEERING_SPEC.md §2/§8, ROADMAP.md M8.
// Mechanical only, same split as every other file in this directory: the
// actual "allow / deny-with-cooldown / create" decision is @prompt-me/core's
// evaluateRewatchAccess, composed with this file's two functions by
// apps/web's lib/rewatch/request-rewatch-access.ts.
import { and, desc, eq } from "drizzle-orm";
import { rewatchSessions, type RewatchSession } from "../schema/rewatch-sessions";
import type { AnyDb } from "../types";

/**
 * The viewer's most recent `rewatch_sessions` row for this match, or
 * `undefined` if they've never triggered a rewatch here before. "Most
 * recent" is the only row @prompt-me/core's evaluateRewatchAccess ever
 * needs — ENGINEERING_SPEC §8's algorithm is entirely defined in terms of
 * "the most recent session," never the full history — ordered by
 * `openedAt` descending, limited to one.
 *
 * Scoped to `viewerId` as well as `matchId`, not just `matchId`: §8 gates a
 * rewatch *request*, and each side of a match opens/cools down
 * independently (schema/rewatch-sessions.ts's own header comment — "each
 * side gets independent cooldowns"), so one person's open window or
 * cooldown never blocks or grants the other's.
 */
export async function getMostRecentRewatchSession(
  db: AnyDb,
  matchId: string,
  viewerId: string,
): Promise<RewatchSession | undefined> {
  const [row] = await db
    .select()
    .from(rewatchSessions)
    .where(and(eq(rewatchSessions.matchId, matchId), eq(rewatchSessions.viewerId, viewerId)))
    .orderBy(desc(rewatchSessions.openedAt))
    .limit(1);
  return row;
}

export interface CreateRewatchSessionInput {
  matchId: string;
  viewerId: string;
  /** Always @prompt-me/core's `evaluateRewatchAccess` "new" branch values —
   * `openedAt`/`expiresAt` are never computed in this file, only persisted. */
  openedAt: Date;
  expiresAt: Date;
}

/**
 * ENGINEERING_SPEC §8 case 3: "create a new session." Unconditional insert
 * — the "should a new session even be created" decision has already been
 * made by @prompt-me/core's evaluateRewatchAccess before this is ever
 * called; this file does no gating of its own, the same division of
 * responsibility as queries/matches.ts's insertMatchIfNotExists (schema
 * enforcement, no business rule).
 */
export async function createRewatchSession(
  db: AnyDb,
  input: CreateRewatchSessionInput,
): Promise<RewatchSession> {
  const [row] = await db
    .insert(rewatchSessions)
    .values({
      matchId: input.matchId,
      viewerId: input.viewerId,
      openedAt: input.openedAt,
      expiresAt: input.expiresAt,
    })
    .returning();
  if (!row) {
    throw new Error(
      `createRewatchSession: insert returned no row for matchId=${input.matchId}, viewerId=${input.viewerId}`,
    );
  }
  return row;
}
