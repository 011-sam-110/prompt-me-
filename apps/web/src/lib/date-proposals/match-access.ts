// Shared participant/active-match guard for every date-proposal
// composition point in this directory (propose.ts, respond.ts,
// set-venue.ts, get-match-proposals.ts) — mirrors
// lib/calendar/get-match-calendar.ts's / lib/rewatch/request-rewatch-access.ts's
// own guard exactly (same reasoning both of those files' header comments
// give: without it, any signed-in user could act on a stranger's match just
// by guessing its id), factored into one function here rather than
// duplicated four times across this one directory's own files.
import { getMatchById, type AnyDb, type Match } from "@prompt-me/db";

export class DateProposalMatchAccessError extends Error {
  constructor(matchId: string, viewerId: string) {
    super(`date-proposals: matchId=${matchId} has no participant viewerId=${viewerId}`);
    this.name = "DateProposalMatchAccessError";
  }
}

export class DateProposalMatchNotActiveError extends Error {
  constructor(matchId: string) {
    super(`date-proposals: matchId=${matchId} is not active`);
    this.name = "DateProposalMatchNotActiveError";
  }
}

/**
 * Resolves `matchId`, confirms `viewerId` is one of its two participants,
 * and confirms the match is still active (not Escaped — SPEC.md §5).
 * Returns the match row so callers that also need `userAId`/`userBId`
 * (e.g. to derive "the other side") don't have to re-fetch it.
 */
export async function assertActiveMatchParticipant(db: AnyDb, matchId: string, viewerId: string): Promise<Match> {
  const match = await getMatchById(db, matchId);
  if (!match || (match.userAId !== viewerId && match.userBId !== viewerId)) {
    throw new DateProposalMatchAccessError(matchId, viewerId);
  }
  if (match.status !== "active") {
    throw new DateProposalMatchNotActiveError(matchId);
  }
  return match;
}
