// The composition point for SPEC.md §6's visibility rule: "Each person
// keeps a busy/available calendar, visible to a match once planning
// starts." Mirrors lib/rewatch/request-rewatch-access.ts's participant
// guard exactly — matchId is looked up, the signed-in viewer is confirmed
// as one of its two sides, and only then are calendars read.
//
// "Once planning starts" and lifecycle.ts's own header comment: today only
// two of the full match-lifecycle's eight states have a persisted column at
// all (`matches.status`: "active" | "blocked"), collectively standing in
// for every state at or after Matched (Matched, DatesInPlanning, DateLocked,
// ChatOpen, ChatClosed) — there is no separate "planning has started" flag
// yet to gate on more precisely, since the tables that would carry a finer
// distinction (date_proposals, chat_windows) are still later ROADMAP
// slices. So the calendar becomes visible the instant a `matches` row
// exists and is "active" — i.e. matched and not Escaped — which is exactly
// "once planning starts" under today's two-value model, and stops being
// visible the instant Escape flips it to "blocked" (queries/matches.ts's
// blockMatch), the same permanent removal getActiveMatchesForUser's own
// comment already describes for the planning UI generally.
import { getCalendarSlotsForUser, getMatchById, type AnyDb, type CalendarSlot } from "@prompt-me/db";

/**
 * Thrown when `matchId` doesn't name a real `matches` row, or names one
 * `viewerId` isn't actually a participant in — same guard, same reasoning,
 * as lib/rewatch/request-rewatch-access.ts's RewatchMatchAccessError:
 * without it, any signed-in user could read a stranger's calendar just by
 * guessing a matchId.
 */
export class CalendarMatchAccessError extends Error {
  constructor(matchId: string, viewerId: string) {
    super(`getMatchCalendar: matchId=${matchId} has no participant viewerId=${viewerId}`);
    this.name = "CalendarMatchAccessError";
  }
}

/**
 * Thrown when the match exists and the viewer is a participant, but the
 * pair has been Escaped (`matches.status = "blocked"`) — SPEC.md §5's
 * "immediately removing the pair from the planning UI" applies here exactly
 * as it already does to getActiveMatchesForUser.
 */
export class CalendarMatchNotActiveError extends Error {
  constructor(matchId: string) {
    super(`getMatchCalendar: matchId=${matchId} is not active`);
    this.name = "CalendarMatchNotActiveError";
  }
}

export interface MatchCalendarResult {
  matchId: string;
  otherUserId: string;
  /** The signed-in viewer's own slots — editable via lib/calendar/manage-slots.ts. */
  ownSlots: CalendarSlot[];
  /** The matched partner's slots — read-only from the viewer's side. */
  otherSlots: CalendarSlot[];
}

export async function getMatchCalendar(
  db: AnyDb,
  matchId: string,
  viewerId: string,
): Promise<MatchCalendarResult> {
  const match = await getMatchById(db, matchId);
  if (!match || (match.userAId !== viewerId && match.userBId !== viewerId)) {
    throw new CalendarMatchAccessError(matchId, viewerId);
  }
  if (match.status !== "active") {
    throw new CalendarMatchNotActiveError(matchId);
  }

  const otherUserId = match.userAId === viewerId ? match.userBId : match.userAId;
  const [ownSlots, otherSlots] = await Promise.all([
    getCalendarSlotsForUser(db, viewerId),
    getCalendarSlotsForUser(db, otherUserId),
  ]);

  return { matchId, otherUserId, ownSlots, otherSlots };
}
