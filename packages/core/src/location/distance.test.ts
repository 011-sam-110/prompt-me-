import { describe, expect, it } from "vitest";
import { encodeGeohash, decodeGeohashCenter } from "./geohash";
import { haversineDistanceKm, isWithinRadiusKm } from "./distance";

describe("haversineDistanceKm", () => {
  it("is zero for identical points", () => {
    const point = { latitude: 51.5074, longitude: -0.1278 };
    expect(haversineDistanceKm(point, point)).toBeCloseTo(0, 6);
  });

  it("matches the well-known ~111.19km-per-degree-of-latitude approximation", () => {
    const a = { latitude: 0, longitude: 0 };
    const b = { latitude: 1, longitude: 0 };
    expect(haversineDistanceKm(a, b)).toBeCloseTo(111.19, 0);
  });

  it("is symmetric", () => {
    const a = { latitude: 51.5074, longitude: -0.1278 }; // London
    const b = { latitude: 48.8566, longitude: 2.3522 }; // Paris
    expect(haversineDistanceKm(a, b)).toBeCloseTo(haversineDistanceKm(b, a), 9);
  });
});

describe("isWithinRadiusKm", () => {
  it("is always true for a candidate sharing the viewer's own geohash cell, at any positive radius", () => {
    const cell = encodeGeohash(51.5074, -0.1278, 5);
    expect(isWithinRadiusKm(cell, cell, 1)).toBe(true);
  });

  it("returns true just above the decoded distance and false just below it", () => {
    const viewerCell = encodeGeohash(51.5074, -0.1278, 5); // London
    const candidateCell = encodeGeohash(48.8566, 2.3522, 5); // Paris
    const distance = haversineDistanceKm(
      decodeGeohashCenter(viewerCell),
      decodeGeohashCenter(candidateCell),
    );

    expect(isWithinRadiusKm(viewerCell, candidateCell, Math.ceil(distance) + 1)).toBe(true);
    expect(isWithinRadiusKm(viewerCell, candidateCell, Math.floor(distance) - 1)).toBe(false);
  });

  it("excludes a candidate far outside even the maximum allowed radius_km (500)", () => {
    const viewerCell = encodeGeohash(51.5074, -0.1278, 5); // London
    const candidateCell = encodeGeohash(-33.8688, 151.2093, 5); // Sydney
    expect(isWithinRadiusKm(viewerCell, candidateCell, 500)).toBe(false);
  });
});
