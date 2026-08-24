// ENGINEERING_SPEC.md §14: "Email... for: proposal accepted." Composition
// point — lib/date-proposals/respond.ts's acceptDate calls this, awaited,
// right after acceptDateProposal succeeds. Deliberately NOT wired into
// declineDate — ENGINEERING_SPEC §14's own list names only "proposal
// accepted", not declined.
//
// Sent to the ORIGINAL PROPOSER (proposal.proposedByUserId) — the
// responder who just accepted is the one who took the action, the
// proposer is the one who needs telling their idea was accepted.
import { getNotificationProvider } from "@prompt-me/core";
import { getUserById, type AnyDb, type DateProposal } from "@prompt-me/db";
import { resolveRecipientEmail } from "./resolve-recipient-email";

export class NotifyDateProposalAcceptedProposerNotFoundError extends Error {
  constructor(proposalId: string, userId: string) {
    super(`notifyDateProposalAccepted: proposalId=${proposalId}'s proposer userId=${userId} was not found`);
    this.name = "NotifyDateProposalAcceptedProposerNotFoundError";
  }
}

export async function notifyDateProposalAccepted(db: AnyDb, proposal: DateProposal): Promise<void> {
  const proposer = await getUserById(db, proposal.proposedByUserId);
  if (!proposer) {
    throw new NotifyDateProposalAcceptedProposerNotFoundError(proposal.id, proposal.proposedByUserId);
  }

  const recipientEmail = await resolveRecipientEmail(proposer.clerkId);
  await getNotificationProvider().send({
    type: "date_proposal_accepted",
    recipientEmail,
    matchId: proposal.matchId,
    proposalId: proposal.id,
    ideaText: proposal.ideaText,
    slotStartAt: proposal.slotStartAt,
  });
}
