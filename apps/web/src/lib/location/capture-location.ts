// The composition point ROADMAP.md M6's location half actually runs: takes
// a raw {latitude, longitude} reading (e.g. straight from the browser
// Geolocation API), fuzzes it to a length-5 geohash cell
// (@prompt-me/core's fuzzLocation — ENGINEERING_SPEC §6), and persists
// only that geohash (@prompt-me/db) — mirroring how
// lib/verification/run-check.ts composes the same two packages for M3's
// "process in-memory, discard the raw input" shape.
//
// `input.latitude`/`input.longitude` live only in this function's call
// stack: `fuzzLocation()` reads them and returns a geohash + that cell's
// center point; `updateUserGeohash()` is never passed the raw pair, only
// the already-fuzzed geohash5 string. See capture-location.test.ts for the
// test that proves this rather than just asserting it in a comment.
import { fuzzLocation, type LatLon } from "@prompt-me/core";
import { updateUserGeohash, type AnyDb, type User } from "@prompt-me/db";

export interface CaptureLocationInput {
  latitude: number;
  longitude: number;
}

export interface CaptureLocationResult {
  geohash5: string;
  center: LatLon;
  user: User;
}

export async function captureUserLocation(
  db: AnyDb,
  userId: string,
  input: CaptureLocationInput,
): Promise<CaptureLocationResult> {
  const { geohash5, center } = fuzzLocation(input.latitude, input.longitude);
  const user = await updateUserGeohash(db, userId, geohash5);
  return { geohash5, center, user };
}
