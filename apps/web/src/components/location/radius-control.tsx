"use client";
// SPEC.md §9: "Each user sets a search radius on top of the fuzzed
// location." A minimal slider — commits on release via
// lib/location/actions.ts's updateSearchRadius, which is
// server-validated against @prompt-me/core's MIN_RADIUS_KM/MAX_RADIUS_KM
// (lib/location/set-radius.ts), not just clamped client-side.
//
// Imports from "@prompt-me/core/location" rather than the root barrel —
// same reason components/player/clip-player.tsx imports
// "@prompt-me/core/playback" instead of "@prompt-me/core": the root barrel
// also pulls in adapter modules (e.g. storage's @vercel/blob client) that
// have no place in a client bundle.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MAX_RADIUS_KM, MIN_RADIUS_KM } from "@prompt-me/core/location";
import { updateSearchRadius } from "@/lib/location/actions";

export function RadiusControl({ initialRadiusKm }: { initialRadiusKm: number }) {
  const [radiusKm, setRadiusKm] = useState(initialRadiusKm);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function commit(nextRadiusKm: number) {
    setError(null);
    updateSearchRadius(nextRadiusKm)
      .then(() => {
        startTransition(() => {
          router.refresh();
        });
      })
      .catch(() => {
        setError("Couldn't save that radius. Please try again.");
      });
  }

  return (
    <div className="flex w-full max-w-xs flex-col items-center gap-2">
      <label htmlFor="radius-km" className="text-sm text-muted-foreground">
        Search radius: {radiusKm} km
      </label>
      <input
        id="radius-km"
        type="range"
        min={MIN_RADIUS_KM}
        max={MAX_RADIUS_KM}
        value={radiusKm}
        disabled={isPending}
        onChange={(event) => setRadiusKm(Number(event.target.value))}
        onPointerUp={(event) => commit(Number((event.target as HTMLInputElement).value))}
        className="w-full accent-primary"
      />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
