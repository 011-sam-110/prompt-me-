// The candidate-query/ranking half of M6 (ENGINEERING_SPEC §6) still ships
// as a placeholder here. What's real: the location-capture gate — a
// verified account can't see the feed's location-only prerequisite
// (geohash5) is unset until they share it (lib/location), and once it is,
// their fuzzed-location radius (SPEC.md §9) is user-adjustable right here.
import { redirect } from "next/navigation";
import { getAppDb } from "@/lib/db";
import { getAuthSession } from "@/lib/auth/session";
import { resolveOnboarding } from "@/lib/auth/onboarding";
import { LocationCapture } from "@/components/location/location-capture";
import { RadiusControl } from "@/components/location/radius-control";

export default async function FeedPage() {
  const { clerkId } = await getAuthSession();
  if (!clerkId) {
    redirect("/sign-in");
  }

  const db = await getAppDb();
  const { state, user } = await resolveOnboarding(db, clerkId);

  if (state !== "active") {
    redirect("/onboarding");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <h1 className="text-2xl font-semibold">You&apos;re verified</h1>

      {user.geohash5 === null ? (
        <LocationCapture />
      ) : (
        <>
          <p className="text-muted-foreground">
            Your fuzzed location is set. The candidate feed itself (the
            radius-filtered, ranked query) ships as the rest of M6 lands —
            reaching this page proves the M2 onboarding gate and the
            location-capture step both work.
          </p>
          <RadiusControl initialRadiusKm={user.radiusKm} />
        </>
      )}

      <p className="text-xs text-muted-foreground">Signed in as {user.clerkId}</p>
    </main>
  );
}
