// date_proposals data access — ENGINEERING_SPEC.md §2/§9, SPEC.md §6,
// ROADMAP.md M9. Same mechanical-only split as every other file here: the
// "is this the right shape / who's allowed to do this" domain rules live in
// apps/web's lib/date-proposals/*; this file turns already-validated inputs
// into SQL and enforces a couple of invariants directly in the WHERE
// clause, the same way queries/calendar-slots.ts's deleteCalendarSlot
// enforces ownership in SQL rather than a separate read-then-check.
import { and, desc, eq } from "drizzle-orm";
import { dateProposals, type DateProposal } from "../schema/date-proposals";
import type { AnyDb } from "../types";

export interface CreateDateProposalInput {
  matchId: string;
  proposedByUserId: string;
  ideaText: string;
  slotStartAt: Date;
  slotEndAt: Date;
}

/**
 * Always inserts `ideaSource: "custom"` — ROADMAP.md M9's own scope: "custom
 * idea text for now — M10's generated ideas plug in later." `createGeneratedDateProposal`
 * below is M10's sibling insert path for `ideaSource: "generated"`, wired
 * to `date_ideas_generated` once that table actually had rows to point at.
 */
export async function createDateProposal(db: AnyDb, input: CreateDateProposalInput): Promise<DateProposal> {
  const [row] = await db
    .insert(dateProposals)
    .values({
      matchId: input.matchId,
      proposedByUserId: input.proposedByUserId,
      ideaSource: "custom",
      ideaText: input.ideaText,
      slotStartAt: input.slotStartAt,
      slotEndAt: input.slotEndAt,
    })
    .returning();
  if (!row) {
    throw new Error(`createDateProposal: insert returned no row for matchId=${input.matchId}`);
  }
  return row;
}

export interface CreateGeneratedDateProposalInput {
  matchId: string;
  proposedByUserId: string;
  generatedIdeaId: string;
  /** Denormalized from the `date_ideas_generated` row at propose time —
   * same reasoning this file's header comment (copied from
   * schema/date-proposals.ts) gives for `createDateProposal`'s `ideaText`:
   * a proposal's wording stays stable even if the cached idea is later
   * regenerated. The caller (apps/web's lib/date-ideas/propose-generated.ts)
   * reads this straight off the idea row it already fetched to validate
   * `generatedIdeaId` — this function does not re-derive it. */
  ideaText: string;
  slotStartAt: Date;
  slotEndAt: Date;
}

/**
 * The `ideaSource: "generated"` sibling to `createDateProposal` above —
 * that function's own comment named this as M10's to add "once
 * date_ideas_generated actually has rows to point at." Satisfies the
 * schema's `date_proposals_generated_idea_xor` CHECK (schema/date-proposals.ts)
 * by construction: `ideaSource` and `generatedIdeaId` are always set
 * together here, never independently.
 */
export async function createGeneratedDateProposal(
  db: AnyDb,
  input: CreateGeneratedDateProposalInput,
): Promise<DateProposal> {
  const [row] = await db
    .insert(dateProposals)
    .values({
      matchId: input.matchId,
      proposedByUserId: input.proposedByUserId,
      ideaSource: "generated",
      ideaText: input.ideaText,
      generatedIdeaId: input.generatedIdeaId,
      slotStartAt: input.slotStartAt,
      slotEndAt: input.slotEndAt,
    })
    .returning();
  if (!row) {
    throw new Error(`createGeneratedDateProposal: insert returned no row for matchId=${input.matchId}`);
  }
  return row;
}

export async function getDateProposalById(db: AnyDb, proposalId: string): Promise<DateProposal | undefined> {
  const [row] = await db.select().from(dateProposals).where(eq(dateProposals.id, proposalId));
  return row;
}

/**
 * Every proposal ever made for a match, newest first — SPEC.md §6's
 * "unlimited re-proposals" means this is a full history, not a single
 * current row; the caller (components/date-proposals/proposal-list.tsx)
 * decides how much of it to show.
 */
export async function getDateProposalsForMatch(db: AnyDb, matchId: string): Promise<DateProposal[]> {
  return db.select().from(dateProposals).where(eq(dateProposals.matchId, matchId)).orderBy(desc(dateProposals.createdAt));
}

/**
 * Thrown by `acceptDateProposal`/`declineDateProposal` when `proposalId`
 * doesn't name a row that is currently `status = "pending"` — covers both
 * "never existed" and "already responded to" identically, the same
 * "can't distinguish by probing" reasoning queries/matches.ts's
 * MatchNotFoundError and queries/calendar-slots.ts's
 * CalendarSlotNotFoundError already give their own not-found cases.
 */
export class DateProposalNotPendingError extends Error {
  constructor(proposalId: string) {
    super(`No pending date_proposals row id=${proposalId}`);
    this.name = "DateProposalNotPendingError";
  }
}

/**
 * `status: "pending" → "accepted"`. The WHERE clause's own
 * `status = "pending"` makes this atomic against a race (e.g. a
 * double-submitted Accept tap, or Accept and Decline firing at nearly the
 * same instant): whichever write reaches Postgres first wins, and the
 * second one updates zero rows and throws, rather than silently
 * clobbering the first outcome.
 */
export async function acceptDateProposal(db: AnyDb, proposalId: string): Promise<DateProposal> {
  const [row] = await db
    .update(dateProposals)
    .set({ status: "accepted" })
    .where(and(eq(dateProposals.id, proposalId), eq(dateProposals.status, "pending")))
    .returning();
  if (!row) {
    throw new DateProposalNotPendingError(proposalId);
  }
  return row;
}

/**
 * `status: "pending" → "declined"`. Same atomicity as acceptDateProposal.
 * Never touches `matches` — SPEC.md §6's "unlimited re-proposals" and
 * ROADMAP.md M9's "declining doesn't unmatch" both mean a decline is
 * scoped to this one row and nothing else.
 */
export async function declineDateProposal(db: AnyDb, proposalId: string): Promise<DateProposal> {
  const [row] = await db
    .update(dateProposals)
    .set({ status: "declined" })
    .where(and(eq(dateProposals.id, proposalId), eq(dateProposals.status, "pending")))
    .returning();
  if (!row) {
    throw new DateProposalNotPendingError(proposalId);
  }
  return row;
}

/**
 * Thrown by `setDateProposalVenue` when `proposalId` doesn't name a row
 * that is currently `status = "accepted"` — SPEC.md §6's "accepting
 * requires agreeing a place" is enforced in this order: a venue can only
 * ever be attached to a proposal whose idea/slot side is already accepted,
 * never to one still `pending` or already `declined`.
 */
export class DateProposalNotAcceptedError extends Error {
  constructor(proposalId: string) {
    super(`No accepted date_proposals row id=${proposalId}`);
    this.name = "DateProposalNotAcceptedError";
  }
}

/**
 * Attaches the agreed meeting place to an already-accepted proposal — this
 * is the write that, combined with the row's own `status = "accepted"`,
 * makes @prompt-me/core's isDateProposalLocked start returning true (that
 * function's own header comment).
 */
export async function setDateProposalVenue(
  db: AnyDb,
  proposalId: string,
  venuePlaceId: string,
): Promise<DateProposal> {
  const [row] = await db
    .update(dateProposals)
    .set({ venuePlaceId })
    .where(and(eq(dateProposals.id, proposalId), eq(dateProposals.status, "accepted")))
    .returning();
  if (!row) {
    throw new DateProposalNotAcceptedError(proposalId);
  }
  return row;
}
