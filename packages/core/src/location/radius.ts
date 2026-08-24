// SPEC.md §9: "Each user sets a search radius on top of the fuzzed
// location." `users.radius_km` (packages/db/src/schema/users.ts) already
// enforces "> 0" at the database level (the `users_radius_km_positive`
// CHECK constraint) — these bounds are the additional engineering default
// (not spec'd) that keeps a user-supplied value sane: a 0.1km radius would
// make matching nearly impossible, and a 50,000km one would defeat the
// entire point of a location-based physical-meetup product
// (ENGINEERING_SPEC §9). Kept as named constants (mirroring
// CLIP_DURATION_TOLERANCE_SECONDS's rationale) so revising the range later
// is a one-line change.
export const MIN_RADIUS_KM = 1;
export const MAX_RADIUS_KM = 500;

export function isValidRadiusKm(value: number): boolean {
  return Number.isFinite(value) && value >= MIN_RADIUS_KM && value <= MAX_RADIUS_KM;
}
