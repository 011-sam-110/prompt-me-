// The composition point for SPEC.md §6's "the other accepts/declines."
// Loads the proposal + confirms match participation via
// load-proposal.ts's shared guard, adds the one rule specific to
// responding — the proposer themselves cannot accept/decline their own
// proposal, since SPEC.md's own wording ("the OTHER accepts/declines")
// names a responder distinct from the proposer — then delegates the
// pending->accepted/declined transition to @prompt-me/db, which enforces
// it atomically against a race (that module's own comment on
// acceptDateProposal/declineDateProposal).
import { acceptDateProposal, declineDateProposal, type AnyDb, type DateProposal } from "@prompt-me/db";
import { loadProposalForParticipant } from "./load-proposal";

export class DateProposalSelfResponseError extends Error {
  constructor(proposalId: string, userId: string) {
    super(`respond: userId=${userId} cannot accept/decline their own proposal id=${proposalId}`);
    this.name = "DateProposalSelfResponseError";
  }
}

async function assertResponderIsNotProposer(proposal: DateProposal, responderId: string): Promise<void> {
  if (proposal.proposedByUserId === responderId) {
    throw new DateProposalSelfResponseError(proposal.id, responderId);
  }
}

/**
 * Accepts idea + slot — NOT the venue. This alone does not lock the date;
 * @prompt-me/core's isDateProposalLocked stays false until setDateVenue
 * (set-venue.ts) also runs. SPEC.md §6: "accepting requires agreeing a
 * public-venue meeting place... a date isn't locked until both an
 * idea/slot AND a place are settled."
 */
export async function acceptDate(db: AnyDb, proposalId: string, responderId: string): Promise<DateProposal> {
  const proposal = await loadProposalForParticipant(db, proposalId, responderId);
  await assertResponderIsNotProposer(proposal, responderId);
  return acceptDateProposal(db, proposalId);
}

/**
 * SPEC.md §6 / ROADMAP.md M9: "Unlimited re-proposals; declining doesn't
 * unmatch." This function (and everything it calls) never touches
 * `matches` — @prompt-me/db's declineDateProposal's own comment confirms
 * the write is scoped to this one row only.
 */
export async function declineDate(db: AnyDb, proposalId: string, responderId: string): Promise<DateProposal> {
  const proposal = await loadProposalForParticipant(db, proposalId, responderId);
  await assertResponderIsNotProposer(proposal, responderId);
  return declineDateProposal(db, proposalId);
}
