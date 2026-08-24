// Haversine great-circle distance between two lat/lon points —
// ENGINEERING_SPEC.md §6's candidate query needs this to turn two geohash5
// cells (each already fuzzed and decoded back to a center point, per
// fuzz-location.ts/geohash.ts's own "never the raw input" contract) into a
// kilometre distance it can compare against `radius_km`. Pure and
// dependency-free, same rationale as geohash.ts: reusable unchanged by the
// eventual mobile port (§15) and by the candidate query in packages/db
// without either of them needing a geo extension in Postgres.
import { decodeGeohashCenter, type LatLon } from "./geohash";

/** Mean Earth radius in kilometres — the constant every haversine
 * implementation uses; not a tunable. */
const EARTH_RADIUS_KM = 6371;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Great-circle distance between two lat/lon points, in kilometres. Pure
 * geometry — no opinion about geohashes at all, mirroring geohash.ts's own
 * "general-purpose, one level below the product-specific rule" shape.
 */
export function haversineDistanceKm(a: LatLon, b: LatLon): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return EARTH_RADIUS_KM * c;
}

/**
 * ENGINEERING_SPEC §6's candidate-query radius filter: "users whose
 * geohash5 falls within the viewer's radius_km." Both geohashes are decoded
 * back to their cell's center point (decodeGeohashCenter — never a raw
 * coordinate, because none is ever stored, §6) before the distance check.
 * A viewer's own cell (identical geohash5) is always within radius —
 * distance 0 — for any non-negative radiusKm.
 */
export function isWithinRadiusKm(
  viewerGeohash5: string,
  candidateGeohash5: string,
  radiusKm: number,
): boolean {
  const viewerCenter = decodeGeohashCenter(viewerGeohash5);
  const candidateCenter = decodeGeohashCenter(candidateGeohash5);
  return haversineDistanceKm(viewerCenter, candidateCenter) <= radiusKm;
}
