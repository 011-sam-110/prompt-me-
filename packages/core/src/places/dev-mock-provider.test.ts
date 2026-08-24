import { describe, expect, it } from "vitest";
import { isAllowedVenueType } from "./venue-types";
import { DevMockPlacesProvider } from "./dev-mock-provider";

describe("DevMockPlacesProvider", () => {
  it("returns the full fixed venue list for an empty query", async () => {
    const provider = new DevMockPlacesProvider();
    const results = await provider.searchVenues("");
    expect(results.length).toBeGreaterThanOrEqual(6);
  });

  it("every returned search result is an allowed public-venue type", async () => {
    const provider = new DevMockPlacesProvider();
    const results = await provider.searchVenues("");
    for (const place of results) {
      expect(isAllowedVenueType(place.types)).toBe(true);
    }
  });

  it("filters by name, case-insensitively", async () => {
    const provider = new DevMockPlacesProvider();
    const results = await provider.searchVenues("museum");
    expect(results).toHaveLength(1);
    expect(results[0]!.name).toBe("Riverside Museum");

    const upper = await provider.searchVenues("MUSEUM");
    expect(upper).toEqual(results);
  });

  it("returns an empty array for a query matching nothing", async () => {
    const provider = new DevMockPlacesProvider();
    expect(await provider.searchVenues("nonexistent-venue-xyz")).toEqual([]);
  });

  it("getPlace resolves a valid fixture by id, with its full types array", async () => {
    const provider = new DevMockPlacesProvider();
    const place = await provider.getPlace("dev-mock-place-corner-cafe");
    expect(place).toEqual({
      placeId: "dev-mock-place-corner-cafe",
      name: "The Corner Café",
      address: "12 Church Street",
      types: ["cafe", "food", "point_of_interest", "establishment"],
    });
  });

  it("getPlace returns null for an id that doesn't exist at all", async () => {
    const provider = new DevMockPlacesProvider();
    expect(await provider.getPlace("not-a-real-place-id")).toBeNull();
  });

  it("getPlace CAN resolve the disallowed fixture (it exists) — but it is not an allowed venue type, and searchVenues never surfaces it", async () => {
    const provider = new DevMockPlacesProvider();
    const place = await provider.getPlace("dev-mock-place-disallowed-lodging");
    expect(place).not.toBeNull();
    expect(isAllowedVenueType(place!.types)).toBe(false);

    const searchResults = await provider.searchVenues("");
    expect(searchResults.some((p) => p.placeId === "dev-mock-place-disallowed-lodging")).toBe(false);
    const byName = await provider.searchVenues("grand lodge");
    expect(byName).toEqual([]);
  });
});
