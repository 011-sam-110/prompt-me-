// The composition point for SPEC.md §6's "Either side proposes idea +
// slot": validates with @prompt-me/core (isValidSlotRange, reusing exactly
// the calendar's own range rule — lib/calendar/manage-slots.ts's own
// comment on isValidSlotRange applies identically here) before anything
// reaches the database, which does no business-rule checking of its own
// (packages/db/src/queries/date-proposals.ts's own header comment).
//
// ROADMAP.md M9's scope was: "custom idea text for now — M10's generated
// ideas plug in later." This file only ever writes ideaSource: "custom"
// (via createDateProposal) — the sibling composition point for
// generator-sourced proposals is lib/date-ideas/propose-generated.ts
// (M10, writes ideaSource: "generated" via createGeneratedDateProposal).
import { isValidSlotRange } from "@prompt-me/core";
import { createDateProposal, type AnyDb, type DateProposal } from "@prompt-me/db";
import { notifyNewDateProposal } from "../notifications/notify-new-proposal";
import { assertActiveMatchParticipant } from "./match-access";

export class InvalidIdeaTextError extends Error {
  constructor() {
    super("proposeDate: ideaText must not be empty");
    this.name = "InvalidIdeaTextError";
  }
}

export class InvalidProposalSlotRangeError extends Error {
  constructor(startAt: Date, endAt: Date) {
    super(`proposeDate: endAt (${endAt.toISOString()}) must be after startAt (${startAt.toISOString()})`);
    this.name = "InvalidProposalSlotRangeError";
  }
}

export interface ProposeDateInput {
  ideaText: string;
  slotStartAt: Date;
  slotEndAt: Date;
}

/**
 * `proposerId` must already be a participant in `matchId`'s active match
 * (assertActiveMatchParticipant, throws DateProposalMatchAccessError /
 * DateProposalMatchNotActiveError otherwise) — the same guard SPEC.md §6's
 * planning surface uses everywhere else in this directory. Trims
 * `ideaText` and rejects an empty proposal outright, ahead of the schema's
 * own NOT NULL (same "clear reason before a raw constraint-violation error"
 * rationale lib/calendar/manage-slots.ts's addCalendarSlot gives
 * isValidSlotRange).
 *
 * No restriction on how many pending proposals a match may have at once —
 * SPEC.md §6 says "unlimited re-proposals" with no cap, so this always
 * inserts a fresh row rather than reusing or overwriting an existing one.
 */
export async function proposeDate(
  db: AnyDb,
  matchId: string,
  proposerId: string,
  input: ProposeDateInput,
): Promise<DateProposal> {
  await assertActiveMatchParticipant(db, matchId, proposerId);

  const ideaText = input.ideaText.trim();
  if (ideaText.length === 0) {
    throw new InvalidIdeaTextError();
  }
  if (!isValidSlotRange({ startAt: input.slotStartAt, endAt: input.slotEndAt })) {
    throw new InvalidProposalSlotRangeError(input.slotStartAt, input.slotEndAt);
  }

  const proposal = await createDateProposal(db, {
    matchId,
    proposedByUserId: proposerId,
    ideaText,
    slotStartAt: input.slotStartAt,
    slotEndAt: input.slotEndAt,
  });

  // ENGINEERING_SPEC §14: "new date proposal" — awaited, same "adapter
  // failure propagates loudly" posture notify-new-match.ts's own header
  // comment documents.
  await notifyNewDateProposal(db, proposal);

  return proposal;
}
