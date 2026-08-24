import { describe, expect, it } from "vitest";
import { ALLOWED_VENUE_TYPES, isAllowedVenueType } from "./venue-types";

describe("isAllowedVenueType", () => {
  it("allows a place whose types include a single named-in-spec venue type", () => {
    expect(isAllowedVenueType(["cafe", "food", "point_of_interest", "establishment"])).toBe(true);
  });

  it("allows a place as soon as ANY of its types matches, not requiring all of them to", () => {
    expect(isAllowedVenueType(["point_of_interest", "establishment", "museum"])).toBe(true);
  });

  it("rejects a place with no overlap with the allow-list at all", () => {
    expect(isAllowedVenueType(["point_of_interest", "establishment"])).toBe(false);
  });

  it("rejects an empty types array", () => {
    expect(isAllowedVenueType([])).toBe(false);
  });

  it("rejects Google's own residential/lodging types even alongside generic ones", () => {
    expect(isAllowedVenueType(["lodging", "point_of_interest", "establishment"])).toBe(false);
    expect(isAllowedVenueType(["premise"])).toBe(false);
    expect(isAllowedVenueType(["street_address"])).toBe(false);
  });

  it("every ENGINEERING_SPEC §9 named example type is in the allow-list", () => {
    for (const type of ["restaurant", "cafe", "bar", "museum", "park", "tourist_attraction"]) {
      expect(ALLOWED_VENUE_TYPES.has(type)).toBe(true);
    }
  });
});
