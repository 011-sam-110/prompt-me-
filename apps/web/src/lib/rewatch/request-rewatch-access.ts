// The composition point ENGINEERING_SPEC.md §8 describes: "On a rewatch
// request for a match_id" — fetch the viewer's most recent
// `rewatch_sessions` row (@prompt-me/db), hand it to @prompt-me/core's
// evaluateRewatchAccess along with `now`, then either return the existing
// open session, return a cooldown denial, or persist the new session §8's
// case 3 calls for. Mirrors lib/feed/get-feed.ts's shape exactly: pure
// core rule + mechanical db query, composed here, `now` threaded straight
// through rather than read from ambient global state so a caller (a future
// rewatch action, a test always) controls it.
//
// This is also where "closing/reopening the client mid-window doesn't
// reset the countdown" (SPEC.md §6) actually holds in practice, not just in
// @prompt-me/core's pure logic: a second call with the same matchId/viewerId
// re-reads the *same* persisted row from getMostRecentRewatchSession and
// re-evaluates it against a later `now` — there is no code path here that
// writes a fresh expiresAt over an already-open session.
import { evaluateRewatchAccess, type RewatchAccessDecision } from "@prompt-me/core";
import {
  createRewatchSession,
  getMatchById,
  getMostRecentRewatchSession,
  type AnyDb,
  type RewatchSession,
} from "@prompt-me/db";

/**
 * Thrown when `matchId` doesn't name a real `matches` row, or names one
 * `viewerId` isn't actually a participant in — rewatch_sessions.viewerId
 * carries no foreign-key tie back to matches.userAId/userBId at the schema
 * level (schema/rewatch-sessions.ts), so this composition point is where
 * that check has to live: without it, any signed-in user could probe (or
 * open a session against) a match they have nothing to do with, just by
 * guessing its id.
 */
export class RewatchMatchAccessError extends Error {
  constructor(matchId: string, viewerId: string) {
    super(`requestRewatchAccess: matchId=${matchId} has no participant viewerId=${viewerId}`);
    this.name = "RewatchMatchAccessError";
  }
}

export type RequestRewatchAccessResult =
  | { status: "open"; session: RewatchSession }
  | { status: "cooldown"; cooldownEndsAt: Date; remainingMs: number }
  | { status: "new"; session: RewatchSession };

/**
 * `now` defaults to the real clock for production callers, and is always
 * overridable by a test — same default-parameter shape as
 * lib/feed/get-feed.ts's getRankedFeedForViewer.
 */
export async function requestRewatchAccess(
  db: AnyDb,
  matchId: string,
  viewerId: string,
  now: Date = new Date(),
): Promise<RequestRewatchAccessResult> {
  const match = await getMatchById(db, matchId);
  if (!match || (match.userAId !== viewerId && match.userBId !== viewerId)) {
    throw new RewatchMatchAccessError(matchId, viewerId);
  }

  const mostRecent = await getMostRecentRewatchSession(db, matchId, viewerId);
  const decision: RewatchAccessDecision = evaluateRewatchAccess(
    mostRecent ? { openedAt: mostRecent.openedAt, expiresAt: mostRecent.expiresAt } : null,
    now,
  );

  switch (decision.status) {
    case "open":
      // mostRecent is guaranteed defined here: evaluateRewatchAccess only
      // ever returns "open" when it was handed a non-null session.
      return { status: "open", session: mostRecent! };

    case "cooldown":
      return {
        status: "cooldown",
        cooldownEndsAt: decision.cooldownEndsAt,
        remainingMs: decision.remainingMs,
      };

    case "new": {
      const session = await createRewatchSession(db, {
        matchId,
        viewerId,
        openedAt: decision.openedAt,
        expiresAt: decision.expiresAt,
      });
      return { status: "new", session };
    }
  }
}
