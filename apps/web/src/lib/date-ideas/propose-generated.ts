// The "generated ideas are selectable alongside custom ones" half of
// ROADMAP.md M10 (lib/date-proposals/propose.ts covers the custom-idea
// half). Reuses that file's own InvalidProposalSlotRangeError and
// isValidSlotRange check rather than a second copy — the range rule is
// identical regardless of where the idea text came from.
import { isValidSlotRange } from "@prompt-me/core";
import { createGeneratedDateProposal, getGeneratedIdeaForMatch, type AnyDb, type DateProposal } from "@prompt-me/db";
import { assertActiveMatchParticipant } from "../date-proposals/match-access";
import { InvalidProposalSlotRangeError } from "../date-proposals/propose";
import { notifyNewDateProposal } from "../notifications/notify-new-proposal";

export class GeneratedIdeaNotFoundError extends Error {
  constructor(matchId: string, generatedIdeaId: string) {
    super(`proposeGeneratedDate: no generated idea id=${generatedIdeaId} for matchId=${matchId}`);
    this.name = "GeneratedIdeaNotFoundError";
  }
}

export interface ProposeGeneratedDateInput {
  generatedIdeaId: string;
  slotStartAt: Date;
  slotEndAt: Date;
}

/**
 * `proposerId` must already be a participant in `matchId`'s active match
 * (assertActiveMatchParticipant, same guard proposeDate uses). Re-resolves
 * `generatedIdeaId` through `getGeneratedIdeaForMatch` scoped to this
 * `matchId` rather than trusting the id a client submitted — the same
 * "don't trust an id you were handed, re-validate server-side" posture
 * set-venue.ts's own header comment documents for a venuePlaceId — so a
 * generated-idea id copied from a *different* match cannot be proposed
 * here. Throws GeneratedIdeaNotFoundError for that case,
 * InvalidProposalSlotRangeError for an invalid slot, or
 * DateProposalMatchAccessError/DateProposalMatchNotActiveError
 * (match-access.ts) for an unauthorized/inactive match.
 */
export async function proposeGeneratedDate(
  db: AnyDb,
  matchId: string,
  proposerId: string,
  input: ProposeGeneratedDateInput,
): Promise<DateProposal> {
  await assertActiveMatchParticipant(db, matchId, proposerId);

  const idea = await getGeneratedIdeaForMatch(db, matchId, input.generatedIdeaId);
  if (!idea) {
    throw new GeneratedIdeaNotFoundError(matchId, input.generatedIdeaId);
  }

  if (!isValidSlotRange({ startAt: input.slotStartAt, endAt: input.slotEndAt })) {
    throw new InvalidProposalSlotRangeError(input.slotStartAt, input.slotEndAt);
  }

  const proposal = await createGeneratedDateProposal(db, {
    matchId,
    proposedByUserId: proposerId,
    generatedIdeaId: idea.id,
    ideaText: idea.ideaText,
    slotStartAt: input.slotStartAt,
    slotEndAt: input.slotEndAt,
  });

  // ENGINEERING_SPEC §14: "new date proposal" — SPEC.md draws no
  // distinction between a custom-text proposal and a generated-idea one,
  // so this fires the identical notification lib/date-proposals/propose.ts
  // fires for its own path, rather than only the custom-text path
  // remembering to.
  await notifyNewDateProposal(db, proposal);

  return proposal;
}
