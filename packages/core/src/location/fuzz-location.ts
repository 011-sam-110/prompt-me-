// ENGINEERING_SPEC.md §6: "encode raw lat/lon to a geohash of length 5
// (~4.9km x 4.9km cells) on the server at the point of location capture;
// only the geohash cell (decoded back to its center point) is ever stored
// or used downstream. Raw coordinates are not persisted."
//
// This is the single function ROADMAP.md M6's location-capture flow
// actually calls with a raw lat/lon pair. Its return value contains no
// path back to that raw input — only the length-5 geohash to persist
// (users.geohash5, packages/db/src/schema/users.ts) and that cell's
// already-fuzzed center point, for any immediate use (e.g. showing the
// user their fuzzed area). See
// apps/web/src/lib/location/capture-location.ts for the caller that
// discards the raw pair after this call and never passes it any further
// (mirrors verification/types.ts's "processed in-memory and discarded"
// shape for the raw selfie frame, §3).
import { decodeGeohashCenter, encodeGeohash, type LatLon } from "./geohash";

/** ENGINEERING_SPEC §6: "a geohash of length 5" — not a tunable, the one
 * precision this product ever fuzzes a location to. */
export const LOCATION_GEOHASH_LENGTH = 5;

export interface FuzzedLocation {
  /** The value to persist — the only thing users.geohash5 ever holds. */
  geohash5: string;
  /** `geohash5` decoded back to its cell's center point — never the raw
   * input coordinate. */
  center: LatLon;
}

/**
 * Fuzzes a raw lat/lon reading (e.g. straight from the browser Geolocation
 * API) down to its length-5 geohash cell. The raw `latitude`/`longitude`
 * arguments are read once, here, to compute the hash, and never appear
 * anywhere in the return value.
 */
export function fuzzLocation(latitude: number, longitude: number): FuzzedLocation {
  const geohash5 = encodeGeohash(latitude, longitude, LOCATION_GEOHASH_LENGTH);
  return { geohash5, center: decodeGeohashCenter(geohash5) };
}
