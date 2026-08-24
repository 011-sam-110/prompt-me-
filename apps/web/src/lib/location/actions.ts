"use server";
// Server actions backing the location-capture + radius-control UI
// (components/location/location-capture.tsx,
// components/location/radius-control.tsx). Mirrors
// lib/verification/actions.ts's shape: resolve who's signed in, ensure
// their `users` row exists (same exactly-once guarantee M2's
// resolveOnboarding relies on), then delegate to the composition point.
import { redirect } from "next/navigation";
import { ensureUserForClerkId } from "@prompt-me/db";
import { getAppDb } from "@/lib/db";
import { getAuthSession } from "@/lib/auth/session";
import { captureUserLocation } from "./capture-location";
import { setUserSearchRadius } from "./set-radius";

export interface SubmitLocationCaptureResult {
  geohash5: string;
}

/**
 * `latitude`/`longitude` are read only long enough to hand them to
 * `captureUserLocation`, which fuzzes them to a geohash before anything is
 * persisted — see capture-location.ts / capture-location.test.ts.
 */
export async function submitLocationCapture(
  latitude: number,
  longitude: number,
): Promise<SubmitLocationCaptureResult> {
  const { clerkId } = await getAuthSession();
  if (!clerkId) {
    redirect("/sign-in");
  }

  const db = await getAppDb();
  const user = await ensureUserForClerkId(db, clerkId);
  const { geohash5 } = await captureUserLocation(db, user.id, { latitude, longitude });
  return { geohash5 };
}

export interface UpdateSearchRadiusResult {
  radiusKm: number;
}

export async function updateSearchRadius(radiusKm: number): Promise<UpdateSearchRadiusResult> {
  const { clerkId } = await getAuthSession();
  if (!clerkId) {
    redirect("/sign-in");
  }

  const db = await getAppDb();
  const user = await ensureUserForClerkId(db, clerkId);
  const updated = await setUserSearchRadius(db, user.id, radiusKm);
  return { radiusKm: updated.radiusKm };
}
