// Barrel for @prompt-me/core's location/geohash domain logic
// (ENGINEERING_SPEC.md §6, ROADMAP.md M6). Pure and dependency-free (no
// adapter, no `node:` import) — safe to import from a client component via
// the narrower "@prompt-me/core/location" subpath (package.json) the same
// way components/player/clip-player.tsx imports "@prompt-me/core/playback"
// instead of the root barrel.
export {
  encodeGeohash,
  decodeGeohashBounds,
  decodeGeohashCenter,
  type LatLon,
  type GeohashBounds,
} from "./geohash";
export { fuzzLocation, LOCATION_GEOHASH_LENGTH, type FuzzedLocation } from "./fuzz-location";
export { isValidRadiusKm, MIN_RADIUS_KM, MAX_RADIUS_KM } from "./radius";
export { haversineDistanceKm, isWithinRadiusKm } from "./distance";
