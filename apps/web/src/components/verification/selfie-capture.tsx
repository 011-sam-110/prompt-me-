"use client";
// ROADMAP.md M3: "Liveness/age-check UI flow captures a selfie frame,
// calls the adapter, writes verification_records." This component owns
// only the capture step (camera -> single frame -> server action); the
// adapter call and the write happen server-side
// (lib/verification/actions.ts -> lib/verification/run-check.ts), never
// here — the captured frame is handed to the server action and then
// dropped, never written to any client-side storage either.
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { submitVerificationCheck } from "@/lib/verification/actions";

type CaptureState = "idle" | "starting" | "ready" | "checking" | "error";

export function SelfieCapture() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<CaptureState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function startCamera() {
    setError(null);
    setState("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setState("ready");
    } catch {
      setError("Camera access was denied or unavailable. Allow camera access to continue.");
      setState("error");
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  async function captureAndVerify() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth || 480;
    canvas.height = video.videoHeight || 360;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const selfieFrame = canvas.toDataURL("image/jpeg", 0.8);

    setState("checking");
    setError(null);
    try {
      await submitVerificationCheck(selfieFrame);
      stopCamera();
      startTransition(() => {
        router.refresh();
      });
    } catch {
      stopCamera();
      setError("The verification check failed unexpectedly. Please try again.");
      setState("error");
    }
  }

  const busy = state === "checking" || isPending;

  return (
    <div className="flex w-full flex-col items-center gap-4">
      <div className="aspect-4/3 w-full max-w-xs overflow-hidden rounded-lg border border-border bg-muted">
        <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />
      </div>
      <canvas ref={canvasRef} className="hidden" />

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {state === "ready" ? (
        <Button onClick={captureAndVerify} disabled={busy}>
          {busy ? "Verifying..." : "Capture & verify"}
        </Button>
      ) : (
        <Button onClick={startCamera} disabled={state === "starting"}>
          {state === "starting" ? "Requesting camera..." : "Start camera"}
        </Button>
      )}
    </div>
  );
}
