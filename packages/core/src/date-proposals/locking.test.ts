// ROADMAP.md M9: "write a test proving a partial acceptance (e.g. slot but
// no venue) does not count as locked." This is that test, at the pure-logic
// level — apps/web's lib/date-proposals/respond.test.ts proves the same
// thing again through the real composition layer + a real (PGlite) database.
import { describe, expect, it } from "vitest";
import { isDateProposalLocked } from "./locking";

describe("isDateProposalLocked", () => {
  it("is NOT locked while pending, even with a venue already attached (venue-before-accept is not the flow, but the derivation must not be fooled by it)", () => {
    expect(isDateProposalLocked({ status: "pending", venuePlaceId: "dev-mock-place-corner-cafe" })).toBe(false);
  });

  it("is NOT locked once declined, regardless of venue", () => {
    expect(isDateProposalLocked({ status: "declined", venuePlaceId: null })).toBe(false);
    expect(isDateProposalLocked({ status: "declined", venuePlaceId: "dev-mock-place-corner-cafe" })).toBe(false);
  });

  it("partial acceptance — idea + slot accepted, but no venue yet — does NOT count as locked", () => {
    expect(isDateProposalLocked({ status: "accepted", venuePlaceId: null })).toBe(false);
  });

  it("is locked once accepted AND a venue is attached — idea + slot + venue all agreed together", () => {
    expect(isDateProposalLocked({ status: "accepted", venuePlaceId: "dev-mock-place-corner-cafe" })).toBe(true);
  });
});
