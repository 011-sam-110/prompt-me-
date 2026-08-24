import { describe, expect, it } from "vitest";
import { findOverlappingSlot, isValidSlotRange, slotsOverlap } from "./slots";

const at = (isoTime: string) => new Date(`2026-09-01T${isoTime}:00Z`);

describe("isValidSlotRange", () => {
  it("accepts a range where end is after start", () => {
    expect(isValidSlotRange({ startAt: at("09:00"), endAt: at("10:00") })).toBe(true);
  });

  it("rejects a range where end equals start", () => {
    expect(isValidSlotRange({ startAt: at("09:00"), endAt: at("09:00") })).toBe(false);
  });

  it("rejects a range where end is before start", () => {
    expect(isValidSlotRange({ startAt: at("10:00"), endAt: at("09:00") })).toBe(false);
  });
});

describe("slotsOverlap", () => {
  it("returns true for identical ranges", () => {
    const a = { startAt: at("09:00"), endAt: at("10:00") };
    const b = { startAt: at("09:00"), endAt: at("10:00") };
    expect(slotsOverlap(a, b)).toBe(true);
  });

  it("returns true when one range is fully contained in the other", () => {
    const outer = { startAt: at("09:00"), endAt: at("12:00") };
    const inner = { startAt: at("10:00"), endAt: at("11:00") };
    expect(slotsOverlap(outer, inner)).toBe(true);
    expect(slotsOverlap(inner, outer)).toBe(true);
  });

  it("returns true when ranges partially overlap", () => {
    const a = { startAt: at("09:00"), endAt: at("10:30") };
    const b = { startAt: at("10:00"), endAt: at("11:00") };
    expect(slotsOverlap(a, b)).toBe(true);
    expect(slotsOverlap(b, a)).toBe(true);
  });

  it("returns false for ranges that merely touch at a boundary — adjacent, not contradictory", () => {
    const a = { startAt: at("09:00"), endAt: at("10:00") };
    const b = { startAt: at("10:00"), endAt: at("11:00") };
    expect(slotsOverlap(a, b)).toBe(false);
    expect(slotsOverlap(b, a)).toBe(false);
  });

  it("returns false for ranges with a gap between them", () => {
    const a = { startAt: at("09:00"), endAt: at("10:00") };
    const b = { startAt: at("11:00"), endAt: at("12:00") };
    expect(slotsOverlap(a, b)).toBe(false);
  });
});

describe("findOverlappingSlot", () => {
  it("returns the specific slot a candidate range overlaps", () => {
    const existing = [
      { id: "a", startAt: at("09:00"), endAt: at("10:00") },
      { id: "b", startAt: at("14:00"), endAt: at("15:00") },
    ];
    const found = findOverlappingSlot(existing, { startAt: at("14:30"), endAt: at("15:30") });
    expect(found?.id).toBe("b");
  });

  it("returns undefined when the candidate overlaps nothing", () => {
    const existing = [{ id: "a", startAt: at("09:00"), endAt: at("10:00") }];
    const found = findOverlappingSlot(existing, { startAt: at("11:00"), endAt: at("12:00") });
    expect(found).toBeUndefined();
  });

  it("returns undefined for an empty existing list", () => {
    expect(findOverlappingSlot([], { startAt: at("09:00"), endAt: at("10:00") })).toBeUndefined();
  });
});
