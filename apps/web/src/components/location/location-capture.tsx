"use client";
// ROADMAP.md M6: "Location capture stores only a length-5 geohash." This
// component owns only the capture step (browser Geolocation API -> one
// {latitude, longitude} reading -> server action); the fuzzing and the
// write happen server-side (lib/location/actions.ts ->
// lib/location/capture-location.ts), never here — the raw coordinate pair
// is handed straight to the server action and then dropped, never written
// to any client-side storage. Mirrors
// components/verification/selfie-capture.tsx's shape.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { submitLocationCapture } from "@/lib/location/actions";

type CaptureState = "idle" | "requesting" | "saving" | "error";

export function LocationCapture() {
  const [state, setState] = useState<CaptureState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function requestLocation() {
    setError(null);

    if (!("geolocation" in navigator)) {
      setError("This browser can't share your location. You can try again later.");
      setState("error");
      return;
    }

    setState("requesting");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setState("saving");
        submitLocationCapture(position.coords.latitude, position.coords.longitude)
          .then(() => {
            startTransition(() => {
              router.refresh();
            });
          })
          .catch(() => {
            setError("Couldn't save your location. Please try again.");
            setState("error");
          });
      },
      () => {
        setError("Location access was denied or unavailable. Allow location access to continue.");
        setState("error");
      },
    );
  }

  const busy = state === "requesting" || state === "saving" || isPending;

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <p className="text-sm text-muted-foreground">
        Prompt Me fuzzes your location to a ~5km area before it&apos;s ever used for matching — an
        exact address is never stored (SPEC.md §9).
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button onClick={requestLocation} disabled={busy}>
        {busy ? "Setting your location..." : "Share my location"}
      </Button>
    </div>
  );
}
