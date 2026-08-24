// calendar_slots data access — ENGINEERING_SPEC.md §2/§9, ROADMAP.md M9.
// Mechanical only, same split as every other file in this directory: the
// "is this range valid" / "does it overlap an existing one" decisions are
// @prompt-me/core's isValidSlotRange/findOverlappingSlot, composed here by
// apps/web's lib/calendar/manage-slots.ts — this file does no validation
// of its own beyond the schema's own CHECK.
import { and, asc, eq } from "drizzle-orm";
import { calendarSlots, type CalendarSlot } from "../schema/calendar-slots";
import type { AnyDb } from "../types";

/**
 * One user's own calendar, ordered by `startAt` ascending — the natural
 * reading order for a busy/available list, and what both
 * lib/calendar/manage-slots.ts's overlap check and any calendar UI want.
 */
export async function getCalendarSlotsForUser(db: AnyDb, userId: string): Promise<CalendarSlot[]> {
  return db
    .select()
    .from(calendarSlots)
    .where(eq(calendarSlots.userId, userId))
    .orderBy(asc(calendarSlots.startAt));
}

export interface CreateCalendarSlotInput {
  userId: string;
  startAt: Date;
  endAt: Date;
  status: CalendarSlot["status"];
}

/**
 * Unconditional insert — the "is this range valid / does it overlap an
 * existing entry" decision has already been made by the caller
 * (lib/calendar/manage-slots.ts) before this is ever reached, the same
 * division of responsibility queries/matches.ts's insertMatchIfNotExists
 * and queries/rewatch-sessions.ts's createRewatchSession already draw.
 */
export async function createCalendarSlot(db: AnyDb, input: CreateCalendarSlotInput): Promise<CalendarSlot> {
  const [row] = await db
    .insert(calendarSlots)
    .values({
      userId: input.userId,
      startAt: input.startAt,
      endAt: input.endAt,
      status: input.status,
    })
    .returning();
  if (!row) {
    throw new Error(`createCalendarSlot: insert returned no row for userId=${input.userId}`);
  }
  return row;
}

/**
 * Thrown by `deleteCalendarSlot` when `slotId` doesn't name a real
 * `calendar_slots` row owned by `userId` — covers both "never existed" and
 * "belongs to someone else" identically, so a caller can't distinguish
 * "wrong id" from "someone else's slot" by probing (the same reasoning
 * queries/matches.ts's MatchNotFoundError gives a not-found pair).
 */
export class CalendarSlotNotFoundError extends Error {
  constructor(slotId: string, userId: string) {
    super(`No calendar_slots row id=${slotId} owned by userId=${userId}`);
    this.name = "CalendarSlotNotFoundError";
  }
}

/**
 * Deletes exactly one slot, scoped to `id` AND `userId` in the same query —
 * ownership is enforced by the WHERE clause itself, not a separate
 * read-then-check, so there is no window in which a caller could delete a
 * row it hasn't already proven it owns.
 */
export async function deleteCalendarSlot(db: AnyDb, slotId: string, userId: string): Promise<void> {
  const deleted = await db
    .delete(calendarSlots)
    .where(and(eq(calendarSlots.id, slotId), eq(calendarSlots.userId, userId)))
    .returning({ id: calendarSlots.id });
  if (deleted.length === 0) {
    throw new CalendarSlotNotFoundError(slotId, userId);
  }
}
