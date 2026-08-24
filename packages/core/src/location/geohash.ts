// Standard geohash encode/decode (Niemeyer's algorithm — the same bit-
// interleaved lat/lon subdivision every "geohash.org"-style implementation
// uses). Pure, dependency-free, framework/DB-free by design (mirrors
// clips/tiers.ts's rationale): the one place the bit-partition math is
// spelled out, reusable unchanged by the eventual mobile port (§15) and by
// any future candidate-query / ranking code (the other half of ROADMAP.md
// M6) that needs to turn a stored `geohash5` back into coordinates for
// distance math.
//
// This module has no opinion about *why* a geohash is being computed —
// that's fuzz-location.ts, which pins the length-5 precision
// ENGINEERING_SPEC.md §6 actually requires. Kept separate so the general
// algorithm (useful at any precision) isn't tangled with the one
// product-specific rule (always length 5).

/** Excludes "a", "i", "l", "o" — the standard geohash base32 alphabet, chosen
 * historically to avoid visual ambiguity with digits. */
const BASE32_ALPHABET = "0123456789bcdefghjkmnpqrstuvwxyz";

export interface LatLon {
  latitude: number;
  longitude: number;
}

export interface GeohashBounds {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

function assertValidCoordinate(latitude: number, longitude: number): void {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new RangeError(`encodeGeohash: latitude must be a finite number in [-90, 90], got ${latitude}`);
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new RangeError(`encodeGeohash: longitude must be a finite number in [-180, 180], got ${longitude}`);
  }
}

/**
 * Encodes a raw lat/lon pair into a base32 geohash string of `precision`
 * characters (default 5 — ENGINEERING_SPEC §6's cell size). Two points
 * close enough to fall in the same cell produce the *identical* string —
 * that collision is the actual privacy mechanism (§6's "location fuzzing"),
 * not a side effect to work around.
 */
export function encodeGeohash(latitude: number, longitude: number, precision = 5): string {
  assertValidCoordinate(latitude, longitude);
  if (!Number.isInteger(precision) || precision < 1) {
    throw new RangeError(`encodeGeohash: precision must be a positive integer, got ${precision}`);
  }

  let latMin = -90;
  let latMax = 90;
  let lonMin = -180;
  let lonMax = 180;
  let isEvenBit = true; // bit-interleaving always starts with longitude
  let bitsInChar = 0;
  let charValue = 0;
  let geohash = "";

  while (geohash.length < precision) {
    if (isEvenBit) {
      const mid = (lonMin + lonMax) / 2;
      if (longitude >= mid) {
        charValue = (charValue << 1) + 1;
        lonMin = mid;
      } else {
        charValue = charValue << 1;
        lonMax = mid;
      }
    } else {
      const mid = (latMin + latMax) / 2;
      if (latitude >= mid) {
        charValue = (charValue << 1) + 1;
        latMin = mid;
      } else {
        charValue = charValue << 1;
        latMax = mid;
      }
    }
    isEvenBit = !isEvenBit;

    if (bitsInChar < 4) {
      bitsInChar += 1;
    } else {
      geohash += BASE32_ALPHABET[charValue];
      bitsInChar = 0;
      charValue = 0;
    }
  }

  return geohash;
}

/**
 * Decodes a geohash string back to the lat/lon rectangle it represents.
 * The inverse of `encodeGeohash`'s bit-partitioning — never recovers the
 * original raw coordinate (that information was discarded at encode time
 * by design), only the cell it fell in.
 */
export function decodeGeohashBounds(geohash: string): GeohashBounds {
  if (geohash.length === 0) {
    throw new RangeError("decodeGeohashBounds: geohash must not be empty");
  }

  let latMin = -90;
  let latMax = 90;
  let lonMin = -180;
  let lonMax = 180;
  let isEvenBit = true;

  for (const char of geohash.toLowerCase()) {
    const charValue = BASE32_ALPHABET.indexOf(char);
    if (charValue === -1) {
      throw new RangeError(`decodeGeohashBounds: "${char}" is not a valid geohash character`);
    }

    for (let bit = 4; bit >= 0; bit -= 1) {
      const bitValue = (charValue >> bit) & 1;
      if (isEvenBit) {
        const mid = (lonMin + lonMax) / 2;
        if (bitValue === 1) lonMin = mid;
        else lonMax = mid;
      } else {
        const mid = (latMin + latMax) / 2;
        if (bitValue === 1) latMin = mid;
        else latMax = mid;
      }
      isEvenBit = !isEvenBit;
    }
  }

  return { minLat: latMin, maxLat: latMax, minLon: lonMin, maxLon: lonMax };
}

/**
 * Decodes a geohash to its cell's center point — ENGINEERING_SPEC §6's
 * "only the geohash cell (decoded back to its center point) is ever...
 * used downstream." This is what any future radius/distance math (the
 * candidate-query half of M6) should call, never a stored raw coordinate,
 * because none exists.
 */
export function decodeGeohashCenter(geohash: string): LatLon {
  const bounds = decodeGeohashBounds(geohash);
  return {
    latitude: (bounds.minLat + bounds.maxLat) / 2,
    longitude: (bounds.minLon + bounds.maxLon) / 2,
  };
}
