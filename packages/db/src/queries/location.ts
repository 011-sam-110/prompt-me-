// ROADMAP.md M6 / ENGINEERING_SPEC.md §6: persists only the already-fuzzed
// length-5 geohash to `users.geohash5` — there is no parameter here (or
// anywhere upstream in this call chain) through which a raw lat/lon could
// travel this far. See apps/web/src/lib/location/capture-location.ts for
// the caller that computes the geohash via @prompt-me/core's fuzzLocation
// and discards the raw input before this function is ever called (mirrors
// packages/db/src/queries/verification.ts's "no raw frame reaches this
// far" shape for the raw selfie).
//
// `radius_km` (SPEC.md §9: "Each user sets a search radius on top of the
// fuzzed location") is independently user-adjustable — updating one column
// never implicitly touches the other.
import { eq } from "drizzle-orm";
import { users, type User } from "../schema/users";
import type { AnyDb } from "../types";

/**
 * Sets `users.geohash5` to an already-fuzzed length-5 geohash string. The
 * `geohash5` parameter's type is a plain `string`, not a lat/lon pair —
 * this function has no arity through which raw coordinates could be passed
 * even by mistake.
 */
export async function updateUserGeohash(db: AnyDb, userId: string, geohash5: string): Promise<User> {
  const [user] = await db
    .update(users)
    .set({ geohash5, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();

  if (!user) {
    throw new Error(`updateUserGeohash: no users row found for userId=${userId}`);
  }
  return user;
}

/** SPEC.md §9's user-adjustable search radius on top of the fuzzed location. */
export async function updateUserRadiusKm(db: AnyDb, userId: string, radiusKm: number): Promise<User> {
  const [user] = await db
    .update(users)
    .set({ radiusKm, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();

  if (!user) {
    throw new Error(`updateUserRadiusKm: no users row found for userId=${userId}`);
  }
  return user;
}
