// The composition point for a user's own busy/available calendar —
// ENGINEERING_SPEC.md §2/§9, SPEC.md §6: "Each person keeps a busy/available
// calendar." Mirrors lib/location/set-radius.ts's shape: validate with
// @prompt-me/core before anything reaches the database, which does no
// business-rule checking of its own (packages/db/src/queries/calendar-slots.ts's
// own header comment).
import { findOverlappingSlot, isValidSlotRange } from "@prompt-me/core";
import {
  createCalendarSlot,
  deleteCalendarSlot,
  getCalendarSlotsForUser,
  type AnyDb,
  type CalendarSlot,
} from "@prompt-me/db";

export class InvalidSlotRangeError extends Error {
  constructor(startAt: Date, endAt: Date) {
    super(`addCalendarSlot: endAt (${endAt.toISOString()}) must be after startAt (${startAt.toISOString()})`);
    this.name = "InvalidSlotRangeError";
  }
}

/**
 * Thrown when a requested range overlaps one of the caller's own existing
 * slots — packages/core/src/calendar/slots.ts's own header comment explains
 * why overlap is rejected rather than silently merged/replaced: a
 * busy/available calendar has no room for two statuses covering the same
 * instant.
 */
export class OverlappingSlotError extends Error {
  readonly conflictingSlotId: string;

  constructor(conflictingSlotId: string) {
    super(`addCalendarSlot: requested range overlaps existing slot id=${conflictingSlotId}`);
    this.name = "OverlappingSlotError";
    this.conflictingSlotId = conflictingSlotId;
  }
}

export interface AddCalendarSlotInput {
  startAt: Date;
  endAt: Date;
  status: CalendarSlot["status"];
}

/**
 * Validates the range (isValidSlotRange — ahead of the DB's own CHECK, same
 * reasoning setUserSearchRadius's comment gives for isValidRadiusKm),
 * re-reads the caller's own current calendar and rejects an overlap
 * (findOverlappingSlot) before ever writing, then persists. `userId` is
 * always the signed-in caller — this file never takes a target user id, so
 * there is no arity through which one user could add a slot to another's
 * calendar even by mistake.
 */
export async function addCalendarSlot(
  db: AnyDb,
  userId: string,
  input: AddCalendarSlotInput,
): Promise<CalendarSlot> {
  if (!isValidSlotRange({ startAt: input.startAt, endAt: input.endAt })) {
    throw new InvalidSlotRangeError(input.startAt, input.endAt);
  }

  const existing = await getCalendarSlotsForUser(db, userId);
  const conflict = findOverlappingSlot(existing, { startAt: input.startAt, endAt: input.endAt });
  if (conflict) {
    throw new OverlappingSlotError(conflict.id);
  }

  return createCalendarSlot(db, {
    userId,
    startAt: input.startAt,
    endAt: input.endAt,
    status: input.status,
  });
}

/**
 * Removes one of the caller's own slots. Delegates ownership enforcement
 * entirely to deleteCalendarSlot's own WHERE clause (packages/db) — this
 * function adds no check of its own beyond passing `userId` through, so
 * there's exactly one place in the codebase that decides "does this user
 * own this slot," not two that could drift apart.
 */
export async function removeCalendarSlot(db: AnyDb, userId: string, slotId: string): Promise<void> {
  await deleteCalendarSlot(db, slotId, userId);
}
