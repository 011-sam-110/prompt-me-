import { describe, expect, it } from "vitest";
import { decodeGeohashBounds, decodeGeohashCenter, encodeGeohash } from "./geohash";

const VALID_BASE32_CHARS = /^[0-9b-hjkmnp-z]+$/;

// A spread of real-world points, including edges (equator, prime
// meridian, antimeridian, poles) where naive off-by-one bugs in the
// bit-partition loop tend to surface.
const SAMPLE_POINTS: LatLonSample[] = [
  { label: "London", latitude: 51.5074, longitude: -0.1278 },
  { label: "New York", latitude: 40.7128, longitude: -74.006 },
  { label: "Sydney", latitude: -33.8688, longitude: 151.2093 },
  { label: "equator/prime meridian", latitude: 0, longitude: 0 },
  { label: "near north pole", latitude: 89.9, longitude: 45 },
  { label: "near south pole", latitude: -89.9, longitude: -45 },
  { label: "near antimeridian (east)", latitude: 12.3, longitude: 179.9 },
  { label: "near antimeridian (west)", latitude: 12.3, longitude: -179.9 },
];

interface LatLonSample {
  label: string;
  latitude: number;
  longitude: number;
}

describe("encodeGeohash", () => {
  it("returns a 5-character string by default (ENGINEERING_SPEC §6's cell size)", () => {
    expect(encodeGeohash(51.5074, -0.1278)).toHaveLength(5);
  });

  it("returns a string of the requested precision", () => {
    expect(encodeGeohash(51.5074, -0.1278, 1)).toHaveLength(1);
    expect(encodeGeohash(51.5074, -0.1278, 9)).toHaveLength(9);
  });

  it("only ever uses the standard base32 geohash alphabet (excludes a/i/l/o)", () => {
    for (const { latitude, longitude } of SAMPLE_POINTS) {
      const hash = encodeGeohash(latitude, longitude, 8);
      expect(hash).toMatch(VALID_BASE32_CHARS);
    }
  });

  it("is deterministic — the same input always produces the same hash", () => {
    const a = encodeGeohash(51.5074, -0.1278);
    const b = encodeGeohash(51.5074, -0.1278);
    expect(a).toBe(b);
  });

  it("gives distinct real-world locations distinct hashes", () => {
    const hashes = new Set(SAMPLE_POINTS.map((p) => encodeGeohash(p.latitude, p.longitude)));
    expect(hashes.size).toBe(SAMPLE_POINTS.length);
  });

  it("gives two points inside the same cell the identical hash — the actual fuzzing/privacy mechanism", () => {
    // Derive a cell's bounds, then pick two distinct points comfortably
    // inside it (not on the boundary, to avoid float-rounding flakiness).
    const bounds = decodeGeohashBounds(encodeGeohash(51.5074, -0.1278, 5));
    const latSpan = bounds.maxLat - bounds.minLat;
    const lonSpan = bounds.maxLon - bounds.minLon;

    const pointA = { lat: bounds.minLat + latSpan * 0.1, lon: bounds.minLon + lonSpan * 0.1 };
    const pointB = { lat: bounds.minLat + latSpan * 0.9, lon: bounds.minLon + lonSpan * 0.9 };

    expect(pointA).not.toEqual(pointB);
    expect(encodeGeohash(pointA.lat, pointA.lon, 5)).toBe(encodeGeohash(pointB.lat, pointB.lon, 5));
  });

  it("accepts boundary coordinates (±90 lat, ±180 lon) without throwing", () => {
    expect(encodeGeohash(90, 180)).toHaveLength(5);
    expect(encodeGeohash(-90, -180)).toHaveLength(5);
  });

  it("rejects an out-of-range or non-finite latitude", () => {
    expect(() => encodeGeohash(90.1, 0)).toThrow(RangeError);
    expect(() => encodeGeohash(-90.1, 0)).toThrow(RangeError);
    expect(() => encodeGeohash(Number.NaN, 0)).toThrow(RangeError);
    expect(() => encodeGeohash(Number.POSITIVE_INFINITY, 0)).toThrow(RangeError);
  });

  it("rejects an out-of-range or non-finite longitude", () => {
    expect(() => encodeGeohash(0, 180.1)).toThrow(RangeError);
    expect(() => encodeGeohash(0, -180.1)).toThrow(RangeError);
    expect(() => encodeGeohash(0, Number.NaN)).toThrow(RangeError);
  });

  it("rejects a non-positive or non-integer precision", () => {
    expect(() => encodeGeohash(0, 0, 0)).toThrow(RangeError);
    expect(() => encodeGeohash(0, 0, -1)).toThrow(RangeError);
    expect(() => encodeGeohash(0, 0, 2.5)).toThrow(RangeError);
  });
});

describe("decodeGeohashBounds / decodeGeohashCenter", () => {
  it("round-trips: the original point always falls inside its own decoded bounds", () => {
    for (const { label, latitude, longitude } of SAMPLE_POINTS) {
      const bounds = decodeGeohashBounds(encodeGeohash(latitude, longitude, 5));
      expect(latitude, `${label}: latitude outside its own cell`).toBeGreaterThanOrEqual(bounds.minLat);
      expect(latitude, `${label}: latitude outside its own cell`).toBeLessThanOrEqual(bounds.maxLat);
      expect(longitude, `${label}: longitude outside its own cell`).toBeGreaterThanOrEqual(bounds.minLon);
      expect(longitude, `${label}: longitude outside its own cell`).toBeLessThanOrEqual(bounds.maxLon);
    }
  });

  it("the decoded center sits within half a cell of the original point", () => {
    for (const { label, latitude, longitude } of SAMPLE_POINTS) {
      const hash = encodeGeohash(latitude, longitude, 5);
      const bounds = decodeGeohashBounds(hash);
      const center = decodeGeohashCenter(hash);
      const halfLat = (bounds.maxLat - bounds.minLat) / 2 + 1e-9;
      const halfLon = (bounds.maxLon - bounds.minLon) / 2 + 1e-9;
      expect(Math.abs(center.latitude - latitude), label).toBeLessThanOrEqual(halfLat);
      expect(Math.abs(center.longitude - longitude), label).toBeLessThanOrEqual(halfLon);
    }
  });

  it("a length-5 cell is approximately 4.9km x 4.9km near the equator (ENGINEERING_SPEC §6)", () => {
    const bounds = decodeGeohashBounds(encodeGeohash(0, 0, 5));
    const KM_PER_DEGREE = 111.32;
    const heightKm = (bounds.maxLat - bounds.minLat) * KM_PER_DEGREE;
    const widthKm = (bounds.maxLon - bounds.minLon) * KM_PER_DEGREE; // cos(0) = 1

    expect(heightKm).toBeCloseTo(4.89, 1);
    expect(widthKm).toBeCloseTo(4.89, 1);
  });

  it("a cell's east-west width shrinks toward the poles while its north-south height stays constant", () => {
    const equatorBounds = decodeGeohashBounds(encodeGeohash(0, 0, 5));
    const sixtyBounds = decodeGeohashBounds(encodeGeohash(60, 0, 5));

    // Latitude spans (north-south height) are identical at any latitude —
    // only the real-world east-west width (which depends on cos(latitude))
    // changes.
    expect(sixtyBounds.maxLat - sixtyBounds.minLat).toBeCloseTo(equatorBounds.maxLat - equatorBounds.minLat, 9);

    const equatorWidthKm = (equatorBounds.maxLon - equatorBounds.minLon) * 111.32 * Math.cos(0);
    const sixtyWidthKm = (sixtyBounds.maxLon - sixtyBounds.minLon) * 111.32 * Math.cos((60 * Math.PI) / 180);
    expect(sixtyWidthKm).toBeLessThan(equatorWidthKm);
  });

  it("rejects an empty geohash", () => {
    expect(() => decodeGeohashBounds("")).toThrow(RangeError);
  });

  it("rejects a geohash containing characters outside the base32 alphabet (a/i/l/o excluded)", () => {
    expect(() => decodeGeohashBounds("gcpvj")).not.toThrow(); // sanity: valid chars pass
    expect(() => decodeGeohashBounds("gcpva")).toThrow(RangeError); // "a" excluded
    expect(() => decodeGeohashBounds("gcpvi")).toThrow(RangeError); // "i" excluded
    expect(() => decodeGeohashBounds("gcpvl")).toThrow(RangeError); // "l" excluded
    expect(() => decodeGeohashBounds("gcpvo")).toThrow(RangeError); // "o" excluded
    expect(() => decodeGeohashBounds("gcpvj!")).toThrow(RangeError);
  });

  it("is case-insensitive", () => {
    expect(decodeGeohashBounds("GCPVJ")).toEqual(decodeGeohashBounds("gcpvj"));
  });
});
