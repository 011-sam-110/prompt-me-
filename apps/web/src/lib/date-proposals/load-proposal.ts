// Shared "does this proposal exist, and is the viewer allowed to touch it
// at all" guard for respond.ts and set-venue.ts — factored out so that
// decision is made in exactly one place, the same reasoning match-access.ts's
// own header comment gives for factoring the match-participant check.
import { getDateProposalById, type AnyDb, type DateProposal } from "@prompt-me/db";
import { assertActiveMatchParticipant } from "./match-access";

export class DateProposalNotFoundError extends Error {
  constructor(proposalId: string) {
    super(`No date_proposals row id=${proposalId}`);
    this.name = "DateProposalNotFoundError";
  }
}

/**
 * Loads a proposal by id and confirms `viewerId` is a participant in its
 * (still-active) match — throws DateProposalNotFoundError,
 * DateProposalMatchAccessError, or DateProposalMatchNotActiveError
 * (match-access.ts) as appropriate. Does NOT check `status` or who
 * proposed it — callers (respond.ts's self-response check,
 * set-venue.ts's db-layer accepted-only guard) apply whatever
 * further restriction their own action needs on top of this.
 */
export async function loadProposalForParticipant(
  db: AnyDb,
  proposalId: string,
  viewerId: string,
): Promise<DateProposal> {
  const proposal = await getDateProposalById(db, proposalId);
  if (!proposal) {
    throw new DateProposalNotFoundError(proposalId);
  }
  await assertActiveMatchParticipant(db, proposal.matchId, viewerId);
  return proposal;
}
