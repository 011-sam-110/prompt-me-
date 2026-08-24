"use client";
// ROADMAP.md M5's own acceptance evidence: "Vertical pass-scroll is locked
// until 5s elapsed on clip 1; Playwright test demonstrates the lock and its
// release." Wires ClipPlayer's scroll-lock callback into
// ScrollLockContainer, with a second panel underneath standing in for "the
// next candidate" — the real discovery feed (M6) will replace this
// standalone page with the actual candidate stack, reusing both of these
// components unchanged.
import { useState } from "react";
import { ClipPlayer } from "./clip-player";
import { ScrollLockContainer } from "./scroll-lock-container";

export interface ClipPlaybackDemoProps {
  clipId: string;
  mediaUrl: string;
  durationSeconds: number;
  format: "audio" | "video";
  isFirstClip: boolean;
}

export function ClipPlaybackDemo(props: ClipPlaybackDemoProps) {
  const [locked, setLocked] = useState(props.isFirstClip);

  return (
    <ScrollLockContainer locked={locked}>
      <section
        data-testid="current-candidate"
        className="flex h-[70vh] w-full shrink-0 flex-col items-center justify-center gap-4 border-b border-border p-4"
        style={{ scrollSnapAlign: "start" }}
      >
        <ClipPlayer
          clipId={props.clipId}
          mediaUrl={props.mediaUrl}
          durationSeconds={props.durationSeconds}
          format={props.format}
          isFirstClip={props.isFirstClip}
          onScrollLockChange={setLocked}
        />
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
