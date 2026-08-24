// SPEC.md §9: "Each user sets a search radius on top of the fuzzed
// location." This composition point validates the requested radius with
// @prompt-me/core's isValidRadiusKm before it ever reaches the database —
// the DB's own `users_radius_km_positive` CHECK (packages/db/src/schema/
// users.ts) only rules out zero/negative, not an absurd value like
// 50,000km, so this is the layer that enforces the sane engineering-default
// range (packages/core/src/location/radius.ts).
import { isValidRadiusKm, MAX_RADIUS_KM, MIN_RADIUS_KM } from "@prompt-me/core";
import { updateUserRadiusKm, type AnyDb, type User } from "@prompt-me/db";

export class InvalidRadiusError extends Error {}

export async function setUserSearchRadius(db: AnyDb, userId: string, radiusKm: number): Promise<User> {
  if (!isValidRadiusKm(radiusKm)) {
    throw new InvalidRadiusError(
      `setUserSearchRadius: radiusKm must be between ${MIN_RADIUS_KM} and ${MAX_RADIUS_KM}, got ${radiusKm}`,
    );
  }
  return updateUserRadiusKm(db, userId, radiusKm);
}
