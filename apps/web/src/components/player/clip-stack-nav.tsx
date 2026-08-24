"use client";
// The scroll navigation shell — ROADMAP.md M5, SPEC.md §3. Supersedes the
// original clip-playback-demo.tsx (single clip only): a profile's whole
// clip stack now renders as one horizontally-scrollable row (the "lateral"
// gesture, in upload order), and the row as a whole sits inside the
// existing vertical ScrollLockContainer standing in for "the next
// candidate" (the "vertical"/pass gesture, unchanged from the original M5
// build) — the real discovery feed (M6) replaces the "next profile" panel
// with the actual candidate stack, reusing everything else here unchanged.
//
// Two independent gates, both already proven at the pure-function level in
// @prompt-me/core/playback:
//  - Vertical (ScrollLockContainer): locked until clip 1 — and only clip
//    1 — reaches 5 real timeline seconds (hasClearedScrollLock).
//  - Lateral (LateralScrollLockContainer): locked past the first
//    not-yet-completed clip in the stack (maxUnlockedClipIndex) — SPEC.md
//    §3's "each clip must finish before the next unlocks."
import { useCallback, useMemo, useState } from "react";
import { maxUnlockedClipIndex } from "@prompt-me/core/playback";
import { ClipPlayer } from "./clip-player";
import { LateralScrollLockContainer } from "./lateral-scroll-lock-container";
import { ScrollLockContainer } from "./scroll-lock-container";

export interface ClipStackNavClip {
  clipId: string;
  mediaUrl: string;
  durationSeconds: number;
  format: "audio" | "video";
}

export interface ClipStackNavProps {
  /** This profile's own clips, already in upload order (tier ascending —
   * see packages/db's getClipsForUserInUploadOrder). Index 0 is always
   * clip 1, the only clip the vertical lock ever gates. */
  clips: ClipStackNavClip[];
}

export function ClipStackNav({ clips }: ClipStackNavProps) {
  // `isFirstClip` on ClipPlayer already defaults its own initial `locked`
  // state to true for clip 1, so mirroring that here (rather than always
  // starting false) keeps this shell's vertical lock in sync with what the
  // player itself believes before its first onScrollLockChange fires.
  const [verticalLocked, setVerticalLocked] = useState(clips.length > 0);
  const [completed, setCompleted] = useState<boolean[]>(() => clips.map(() => false));

  const maxUnlockedIndex = useMemo(() => maxUnlockedClipIndex(completed), [completed]);

  const handleCompletedChange = useCallback((index: number, isCompleted: boolean) => {
    setCompleted((prev) => {
      if (prev[index] === isCompleted) return prev;
      const next = [...prev];
      next[index] = isCompleted;
      return next;
    });
  }, []);

  if (clips.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-clip-stack-empty="">
        This profile hasn&apos;t uploaded any clips yet.
      </p>
    );
  }

  return (
    <ScrollLockContainer locked={verticalLocked}>
      <section
        data-testid="current-candidate"
        className="flex h-[70vh] w-full shrink-0 flex-col items-center justify-center gap-4 border-b border-border p-4"
        style={{ scrollSnapAlign: "start" }}
      >
        <LateralScrollLockContainer maxUnlockedIndex={maxUnlockedIndex}>
          {clips.map((clip, index) => (
            <div
              key={clip.clipId}
              data-clip-slide=""
              data-clip-index={index}
              className="flex w-full shrink-0 flex-col items-center gap-2"
              style={{ scrollSnapAlign: "start" }}
            >
              <p className="text-xs text-muted-foreground">
                Clip {index + 1} of {clips.length}
              </p>
              <ClipPlayer
                clipId={clip.clipId}
                mediaUrl={clip.mediaUrl}
                durationSeconds={clip.durationSeconds}
                format={clip.format}
                isFirstClip={index === 0}
                onScrollLockChange={index === 0 ? setVerticalLocked : undefined}
                onCompletedChange={(isCompleted) => handleCompletedChange(index, isCompleted)}
              />
            </div>
          ))}
        </LateralScrollLockContainer>
        {clips.length > 1 && (
          <p data-lateral-nav-hint="" className="text-xs text-muted-foreground">
            {maxUnlockedIndex >= clips.length - 1
              ? "Scroll sideways to revisit any clip in this profile."
              : "Finish this clip to unlock the next one sideways."}
          </p>
        )}
      </section>
      <section
        data-testid="next-candidate"
        className="flex h-[70vh] w-full shrink-0 flex-col items-center justify-center gap-2 p-4 text-center text-muted-foreground"
        style={{ scrollSnapAlign: "start" }}
      >
        <p className="text-lg font-medium text-foreground">Next profile</p>
        <p className="text-sm">
          Scrolling here is the pass gesture (SPEC.md §3) — the real candidate
          feed ships in M6.
        </p>
      </section>
    </ScrollLockContainer>
  );
}
