// ENGINEERING_SPEC.md §14: "Email... for: new date proposal." Two
// composition points call this, both awaited right after their own
// createDateProposal/createGeneratedDateProposal write succeeds — same
// "adapter failure propagates loudly" posture notify-new-match.ts's own
// header comment documents:
//   - lib/date-proposals/propose.ts's proposeDate (custom idea text)
//   - lib/date-ideas/propose-generated.ts's proposeGeneratedDate (a
//     generated idea) — SPEC.md draws no distinction between the two once
//     proposed, so both have to fire the identical notification rather
//     than only the custom-text path remembering to.
//
// Sent only to the OTHER participant in the match, never back to whoever
// just proposed it.
import { getNotificationProvider } from "@prompt-me/core";
import { getMatchById, getUserById, type AnyDb, type DateProposal } from "@prompt-me/db";
import { resolveRecipientEmail } from "./resolve-recipient-email";

export class NotifyNewDateProposalMatchNotFoundError extends Error {
  constructor(proposalId: string, matchId: string) {
    super(`notifyNewDateProposal: proposalId=${proposalId} references missing matchId=${matchId}`);
    this.name = "NotifyNewDateProposalMatchNotFoundError";
  }
}

export class NotifyNewDateProposalRecipientNotFoundError extends Error {
  constructor(proposalId: string, userId: string) {
    super(`notifyNewDateProposal: proposalId=${proposalId}'s recipient userId=${userId} was not found`);
    this.name = "NotifyNewDateProposalRecipientNotFoundError";
  }
}

/** Sends the "new date idea proposed" email to whichever participant in
 * `proposal.matchId` did NOT propose it. */
export async function notifyNewDateProposal(db: AnyDb, proposal: DateProposal): Promise<void> {
  const match = await getMatchById(db, proposal.matchId);
  if (!match) {
    throw new NotifyNewDateProposalMatchNotFoundError(proposal.id, proposal.matchId);
  }

  const recipientUserId = match.userAId === proposal.proposedByUserId ? match.userBId : match.userAId;
  const recipient = await getUserById(db, recipientUserId);
  if (!recipient) {
    throw new NotifyNewDateProposalRecipientNotFoundError(proposal.id, recipientUserId);
  }

  const recipientEmail = await resolveRecipientEmail(recipient.clerkId);
  await getNotificationProvider().send({
    type: "new_date_proposal",
    recipientEmail,
    matchId: match.id,
    proposalId: proposal.id,
    ideaText: proposal.ideaText,
    slotStartAt: proposal.slotStartAt,
  });
}
