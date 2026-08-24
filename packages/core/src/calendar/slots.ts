// Busy/available calendar — ENGINEERING_SPEC.md §2/§9, SPEC.md §6: "Each
// person keeps a busy/available calendar, visible to a match once planning
// starts." Pure, DB-free predicates (mirrors location/radius.ts's split):
// packages/db's calendar-slots.ts query file does no validation of its own,
// apps/web's lib/calendar composes these rules with the query layer before
// anything is persisted, the same shape lib/location/set-radius.ts already
// gives isValidRadiusKm.
//
// Neither SPEC.md nor ENGINEERING_SPEC.md say anything about slot
// granularity or overlap policy — this file's two rules are engineering
// defaults, not literal spec text, flagged inline the same way
// schema/enums.ts's reportStatusEnum comment flags its own undecided
// three-state shape:
//  - a slot's own end must be after its own start (isValidSlotRange) — the
//    DB already enforces this too (schema/calendar-slots.ts's
//    `calendar_slots_end_after_start` CHECK), but validating it here first
//    gives a caller a clear reason before a raw constraint-violation error
//    ever reaches Postgres, the same reasoning setUserSearchRadius's own
//    comment gives for re-checking radius bounds ahead of the DB's own
//    (looser) CHECK.
//  - two of one user's own slots may not overlap (slotsOverlap) — a
//    busy/available calendar is a partition of time into one status per
//    instant; two overlapping ranges with the same or different statuses
//    for the same person would leave any instant inside the overlap
//    ambiguous, which the "busy/available" model (ENGINEERING_SPEC §2's own
//    plain description) has no way to represent. Nothing in either spec
//    document says a person may add contradictory or duplicate entries for
//    the same moment, and rejecting them keeps this milestone's data honest
//    without guessing at a merge/replace UX the interview never covered.

export interface SlotRange {
  startAt: Date;
  endAt: Date;
}

/** `endAt` strictly after `startAt` — mirrors the DB's own CHECK constraint. */
export function isValidSlotRange(range: SlotRange): boolean {
  return range.endAt.getTime() > range.startAt.getTime();
}

/**
 * Half-open interval overlap: `[startAt, endAt)` vs. `[startAt, endAt)`.
 * Two slots that merely touch at a boundary (one's `endAt` equals the
 * other's `startAt`) do NOT overlap — "9am–10am" and "10am–11am" are two
 * valid, adjacent, non-contradictory entries.
 */
export function slotsOverlap(a: SlotRange, b: SlotRange): boolean {
  return a.startAt.getTime() < b.endAt.getTime() && b.startAt.getTime() < a.endAt.getTime();
}

/** The first existing slot (if any) that a candidate range would overlap. */
export function findOverlappingSlot<T extends SlotRange>(
  existing: readonly T[],
  candidate: SlotRange,
): T | undefined {
  return existing.find((slot) => slotsOverlap(slot, candidate));
}
