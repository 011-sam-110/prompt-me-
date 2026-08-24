import { describe, expect, it } from "vitest";
import { decodeGeohashCenter, encodeGeohash } from "./geohash";
import { sharedGeohashCell } from "./shared-cell";

describe("sharedGeohashCell", () => {
  it("returns null when neither user has a known cell", () => {
    expect(sharedGeohashCell(null, null)).toBeNull();
  });

  it("returns the other user's cell when only one is known", () => {
    const cell = encodeGeohash(50.8225, -0.1372); // Brighton
    expect(sharedGeohashCell(cell, null)).toBe(cell);
    expect(sharedGeohashCell(null, cell)).toBe(cell);
  });

  it("returns the exact cell unchanged when both users share it", () => {
    const cell = encodeGeohash(50.8225, -0.1372);
    expect(sharedGeohashCell(cell, cell)).toBe(cell);
  });

  it("averages two different cells to the midpoint's own length-5 cell", () => {
    const cellA = encodeGeohash(50.8225, -0.1372); // Brighton
    const cellB = encodeGeohash(50.8429, -0.1313); // ~2km away, still Brighton-ish
    const shared = sharedGeohashCell(cellA, cellB);

    expect(shared).not.toBeNull();
    expect(shared).toHaveLength(5);

    // The result decodes to a point roughly between the two inputs, not
    // identical to either one.
    const centerA = decodeGeohashCenter(cellA);
    const centerB = decodeGeohashCenter(cellB);
    const centerShared = decodeGeohashCenter(shared!);
    const expectedLat = (centerA.latitude + centerB.latitude) / 2;
    const expectedLon = (centerA.longitude + centerB.longitude) / 2;
    expect(centerShared.latitude).toBeCloseTo(expectedLat, 1);
    expect(centerShared.longitude).toBeCloseTo(expectedLon, 1);
  });

  it("is symmetric — argument order doesn't change the result", () => {
    const cellA = encodeGeohash(50.8225, -0.1372);
    const cellB = encodeGeohash(51.5072, -0.1276); // London
    expect(sharedGeohashCell(cellA, cellB)).toBe(sharedGeohashCell(cellB, cellA));
  });
});
