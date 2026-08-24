import { describe, expect, it } from "vitest";
import { decodeGeohashBounds, decodeGeohashCenter, encodeGeohash } from "./geohash";
import { fuzzLocation, LOCATION_GEOHASH_LENGTH } from "./fuzz-location";

describe("fuzzLocation", () => {
  it("always fuzzes to exactly LOCATION_GEOHASH_LENGTH characters", () => {
    expect(LOCATION_GEOHASH_LENGTH).toBe(5);
    expect(fuzzLocation(51.5074, -0.1278).geohash5).toHaveLength(LOCATION_GEOHASH_LENGTH);
  });

  it("geohash5 matches encoding the same point directly at the same precision", () => {
    const result = fuzzLocation(40.7128, -74.006);
    expect(result.geohash5).toBe(encodeGeohash(40.7128, -74.006, LOCATION_GEOHASH_LENGTH));
  });

  it("center matches decoding geohash5 directly", () => {
    const result = fuzzLocation(-33.8688, 151.2093);
    expect(result.center).toEqual(decodeGeohashCenter(result.geohash5));
  });

  it("the returned center is the fuzzed cell's center, not a pass-through of the raw input", () => {
    // A high-precision raw reading essentially never lands exactly on a
    // geohash cell's center point, which sits on a fixed lattice of
    // bisection midpoints — so if fuzzLocation ever accidentally returned
    // the raw coordinate instead of the decoded center, this would catch
    // it for any realistic GPS reading.
    const latitude = 51.500741963258;
    const longitude = -0.127624851937;
    const result = fuzzLocation(latitude, longitude);
    expect(result.center.latitude).not.toBe(latitude);
    expect(result.center.longitude).not.toBe(longitude);
  });

  it("two readings inside the same cell fuzz to the same geohash and the same center", () => {
    // Derive a cell's real bounds first, then pick two distinct points
    // comfortably inside it, so this doesn't depend on guessing a raw
    // offset small enough to never cross a cell boundary.
    const bounds = decodeGeohashBounds(encodeGeohash(51.5074, -0.1278, LOCATION_GEOHASH_LENGTH));
    const latSpan = bounds.maxLat - bounds.minLat;
    const lonSpan = bounds.maxLon - bounds.minLon;

    const a = fuzzLocation(bounds.minLat + latSpan * 0.2, bounds.minLon + lonSpan * 0.2);
    const b = fuzzLocation(bounds.minLat + latSpan * 0.8, bounds.minLon + lonSpan * 0.8);
    expect(a.geohash5).toBe(b.geohash5);
    expect(a.center).toEqual(b.center);
  });

  it("propagates encodeGeohash's validation for an out-of-range coordinate", () => {
    expect(() => fuzzLocation(91, 0)).toThrow(RangeError);
    expect(() => fuzzLocation(0, 181)).toThrow(RangeError);
  });
});
