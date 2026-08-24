// The composition point the planning page reads its proposal list from —
// mirrors lib/calendar/get-match-calendar.ts's shape exactly (same
// assertActiveMatchParticipant guard, factored into match-access.ts so
// both files call the identical check rather than two copies of it).
//
// Also the one place "is this proposal locked" and "what venue did they
// pick" get resolved for display: @prompt-me/core's isDateProposalLocked
// (the same function locking.test.ts / respond.test.ts / set-venue.test.ts
// already prove) decides `locked`, and any proposal with a `venuePlaceId`
// gets it resolved to a name/address via the active places provider — so
// components/date-proposals/proposal-list.tsx never has to know about
// place ids or re-derive the lock rule itself.
import { getDateProposalsForMatch, type AnyDb, type DateProposal } from "@prompt-me/db";
import { getPlacesProvider, isDateProposalLocked, type Place } from "@prompt-me/core";
import { assertActiveMatchParticipant } from "./match-access";

export interface ProposalWithDisplay extends DateProposal {
  locked: boolean;
  /** Resolved from `venuePlaceId` via the active places provider — null
   * until a venue has been chosen (set-venue.ts's setDateVenue). */
  venue: Place | null;
}

export interface MatchProposalsResult {
  matchId: string;
  /** The signed-in viewer's own id — components/date-proposals/proposal-list.tsx
   * uses this to decide, per proposal, whether the viewer is the proposer
   * (who cannot accept/decline their own — respond.ts) or the responder. */
  viewerId: string;
  otherUserId: string;
  /** Every proposal ever made for this match, newest first — SPEC.md §6's
   * "unlimited re-proposals" (queries/date-proposals.ts's own comment). */
  proposals: ProposalWithDisplay[];
}

export async function getMatchProposals(db: AnyDb, matchId: string, viewerId: string): Promise<MatchProposalsResult> {
  const match = await assertActiveMatchParticipant(db, matchId, viewerId);
  const otherUserId = match.userAId === viewerId ? match.userBId : match.userAId;
  const rows = await getDateProposalsForMatch(db, matchId);

  const provider = getPlacesProvider();
  const proposals: ProposalWithDisplay[] = await Promise.all(
    rows.map(async (row) => ({
      ...row,
      locked: isDateProposalLocked(row),
      venue: row.venuePlaceId ? await provider.getPlace(row.venuePlaceId) : null,
    })),
  );

  return { matchId, viewerId, otherUserId, proposals };
}

export { DateProposalMatchAccessError, DateProposalMatchNotActiveError } from "./match-access";
