"use client";
// The clip playback engine itself — SPEC.md §3, ENGINEERING_SPEC.md §5.
//
// Three rules, enforced here:
//  1. No forward-seek in the UI at all: the media element never renders
//     native `controls` (so there is no scrub bar to drag), and every
//     custom control that moves `currentTime` only ever moves it backward
//     (rewind, replay-from-0). `handleSeeking` is a defense-in-depth
//     backstop underneath that — anything that still tries to move
//     `currentTime` forward (a keyboard shortcut, devtools, a future
//     regression) gets clamped back down to the furthest position natural
//     playback has actually reached, via @prompt-me/core's
//     clampSeekTarget.
//  2. Hold-to-2x sets `playbackRate = 2` while held and restores it to 1
//     on release — it never touches `currentTime` in either direction.
//  3. Completion is never decided here. Every position report goes to
//     submitClipViewPosition (a server action), and `completed` state
//     only ever changes to whatever that call's response says — the
//     server is the sole authority (ENGINEERING_SPEC §5/§7).
import { useCallback, useEffect, useRef, useState } from "react";
// Deliberately *not* `@prompt-me/core`'s root barrel: that pulls in every
// adapter the package holds, including frame-sampling's
// FfmpegVideoFrameSampler (`node:child_process`) — server-only code a
// client bundle can't build at all (webpack's UnhandledSchemeError for
// `node:` imports). `@prompt-me/core/playback` is a narrow, genuinely
// client-safe subpath export (package.json) exposing just the pure
// playback predicates this component needs.
import { clampSeekTarget, hasClearedScrollLock } from "@prompt-me/core/playback";
import { Button } from "@/components/ui/button";
import { submitClipViewPosition } from "@/lib/clips/view-position-actions";

export interface ClipPlayerProps {
  clipId: string;
  mediaUrl: string;
  durationSeconds: number;
  format: "audio" | "video";
  /** SPEC.md §3: only clip 1 gates the vertical scroll gesture at all. */
  isFirstClip: boolean;
  /** Notified whenever the scroll-lock state changes, so a wrapping feed
   * container (components/player/scroll-lock-container.tsx) can actually
   * block/allow the vertical "pass" gesture. */
  onScrollLockChange?: (locked: boolean) => void;
}

/** Reports at most this often while playing — a report on every single
 * `timeupdate` tick (fires several times a second) would be needless
 * server load for a value that only needs to be "fresh enough." `ended`
 * and `pause` always force an immediate report regardless of this
 * throttle, so the final position is never lost to timing. */
const POSITION_REPORT_MIN_INTERVAL_MS = 750;

const REWIND_SECONDS = 5;

type MediaEl = HTMLVideoElement | HTMLAudioElement;

export function ClipPlayer({
  clipId,
  mediaUrl,
  durationSeconds,
  format,
  isFirstClip,
  onScrollLockChange,
}: ClipPlayerProps) {
  const mediaRef = useRef<MediaEl>(null);
  const maxReachedSecondsRef = useRef(0);
  const lastReportedAtRef = useRef(0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isHolding2x, setIsHolding2x] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [locked, setLocked] = useState(isFirstClip);
  const [error, setError] = useState<string | null>(null);

  const reportPosition = useCallback(
    (positionSeconds: number, opts?: { force?: boolean }) => {
      const now = Date.now();
      if (!opts?.force && now - lastReportedAtRef.current < POSITION_REPORT_MIN_INTERVAL_MS) {
        return;
      }
      lastReportedAtRef.current = now;
      submitClipViewPosition(clipId, positionSeconds)
        .then((result) => {
          // The server's response is the only thing that can ever set
          // `completed` to true — never a locally-computed
          // `currentTime >= duration` check.
          if (result.completed) setCompleted(true);
        })
        .catch(() => {
          // A transient report failure never blocks playback — the next
          // timeupdate tick (or the forced ended/pause report) retries.
        });
    },
    [clipId],
  );

  const updateLock = useCallback(
    (currentTimeSeconds: number) => {
      setLocked(!hasClearedScrollLock(currentTimeSeconds, isFirstClip));
    },
    [isFirstClip],
  );

  // Notifying the parent (a sibling component's setState) belongs in an
  // effect, never inside the `setLocked` updater itself — calling it there
  // ran during React's render phase and triggered "Cannot update a
  // component while rendering a different component." This single effect
  // covers both the initial announcement and every later change: it fires
  // once on mount with `locked`'s initial value, then again only when
  // `locked` actually changes (React bails out of re-running an effect
  // whose dependency didn't change, and setLocked itself bails out of a
  // re-render when the new value equals the current one).
  useEffect(() => {
    onScrollLockChange?.(locked);
  }, [locked, onScrollLockChange]);

  function handleTimeUpdate() {
    const el = mediaRef.current;
    if (!el) return;
    const t = el.currentTime;
    if (t > maxReachedSecondsRef.current) {
      maxReachedSecondsRef.current = t;
    }
    updateLock(maxReachedSecondsRef.current);
    reportPosition(t);
  }

  function handleSeeking() {
    const el = mediaRef.current;
    if (!el) return;
    const allowed = clampSeekTarget(el.currentTime, maxReachedSecondsRef.current);
    if (Math.abs(allowed - el.currentTime) > 0.01) {
      el.currentTime = allowed;
    }
  }

  function handleEnded() {
    const el = mediaRef.current;
    setIsPlaying(false);
    reportPosition(el?.duration ?? durationSeconds, { force: true });
  }

  function handlePause() {
    const el = mediaRef.current;
    if (!el) return;
    setIsPlaying(false);
    reportPosition(el.currentTime, { force: true });
  }

  function togglePlay() {
    const el = mediaRef.current;
    if (!el) return;
    if (el.paused) {
      el.play()
        .then(() => setIsPlaying(true))
        .catch(() => setError("Playback couldn't start."));
    } else {
      el.pause();
    }
  }

  function rewind() {
    const el = mediaRef.current;
    if (!el) return;
    // Always <= the furthest reached position, so clampSeekTarget never
    // has anything to clamp here — rewinding is unconditionally allowed
    // (SPEC.md §3: "Rewind/replay is free").
    el.currentTime = Math.max(0, el.currentTime - REWIND_SECONDS);
  }

  function replay() {
    const el = mediaRef.current;
    if (!el) return;
    el.currentTime = 0;
    el.play()
      .then(() => setIsPlaying(true))
      .catch(() => setError("Playback couldn't start."));
  }

  function startHold2x() {
    const el = mediaRef.current;
    if (!el) return;
    // Sets the playback rate only — never touches currentTime. ENGINEERING_SPEC
    // §5 / SPEC.md §3: "the 2x hold-to-speed control sets playbackRate = 2
    // rather than jumping currentTime."
    el.playbackRate = 2;
    setIsHolding2x(true);
  }

  function stopHold2x() {
    const el = mediaRef.current;
    if (el) el.playbackRate = 1;
    setIsHolding2x(false);
  }

  return (
    <div
      className="flex w-full flex-col items-center gap-4"
      data-clip-player=""
      data-clip-id={clipId}
      data-completed={completed ? "true" : "false"}
      data-locked={locked ? "true" : "false"}
    >
      {format === "video" ? (
        <video
          ref={mediaRef as React.RefObject<HTMLVideoElement>}
          src={mediaUrl}
          playsInline
          // No `controls` — there is no native scrub bar anywhere in this
          // UI (SPEC.md §3: "No skipping ahead"). Every seek that can
          // still happen goes through the custom rewind/replay controls
          // below, both backward-only.
          controls={false}
          onTimeUpdate={handleTimeUpdate}
          onSeeking={handleSeeking}
          onEnded={handleEnded}
          onPause={handlePause}
          onPlay={() => setIsPlaying(true)}
          className="w-full rounded-lg bg-black"
        />
      ) : (
        <audio
          ref={mediaRef as React.RefObject<HTMLAudioElement>}
          src={mediaUrl}
          controls={false}
          onTimeUpdate={handleTimeUpdate}
          onSeeking={handleSeeking}
          onEnded={handleEnded}
          onPause={handlePause}
          onPlay={() => setIsPlaying(true)}
          className="hidden"
        />
      )}

      {format === "audio" && (
        <div className="flex h-40 w-full max-w-xs items-center justify-center rounded-lg border border-border bg-muted text-sm text-muted-foreground">
          {isPlaying ? "Playing…" : "Audio clip"}
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {isFirstClip && (
        <p
          data-scroll-lock-banner=""
          className="text-xs text-muted-foreground"
        >
          {locked
            ? "Scrolling to the next profile is locked for the first 5 seconds."
            : "Unlocked — you can scroll to the next profile now."}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button onClick={togglePlay} disabled={completed && !isPlaying}>
          {isPlaying ? "Pause" : "Play"}
        </Button>
        <Button variant="outline" onClick={rewind}>
          -{REWIND_SECONDS}s
        </Button>
        <Button
          variant="outline"
          data-hold-2x=""
          aria-pressed={isHolding2x}
          onPointerDown={startHold2x}
          onPointerUp={stopHold2x}
          onPointerLeave={stopHold2x}
          onPointerCancel={stopHold2x}
        >
          {isHolding2x ? "2x…" : "Hold for 2x"}
        </Button>
      </div>

      {completed && (
        <div className="flex flex-col items-center gap-2" data-completed-panel="">
          <p className="text-sm font-medium text-foreground">Completed ✓</p>
          <Button variant="ghost" onClick={replay}>
            Replay
          </Button>
        </div>
      )}
    </div>
  );
}
