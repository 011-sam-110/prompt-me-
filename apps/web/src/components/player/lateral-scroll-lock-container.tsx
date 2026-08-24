"use client";
// SPEC.md §3: "Lateral scroll = move between one candidate's own clips, in
// upload order" + the thesis's central rule, restated twice ("nothing can
// be skipped", §1; "each clip must finish before the next unlocks...
// jumping to a later clip is not [allowed]", §3). The horizontal analog of
// scroll-lock-container.tsx's vertical lock — but where that container is
// a single on/off `locked` boolean (clip 1 vs. every other clip), this one
// gates a *position*: how far along the child slide list the gesture may
// reach, driven by @prompt-me/core's maxUnlockedClipIndex.
//
// Same two-layer enforcement as the vertical lock: a `wheel` listener
// preventDefaults a forward (positive deltaX) scroll attempt once already
// sitting on the furthest unlocked slide, and a `scroll` listener snaps
// `scrollLeft` back to the furthest unlocked slide's position if anything
// still moved past it (a swipe's momentum, `scrollIntoView`, devtools).
// Backward movement (revisiting an earlier, already-unlocked clip) is
// never blocked by either layer — SPEC.md §3: "Rewind/replay is free."
import { useEffect, useRef } from "react";

export interface LateralScrollLockContainerProps {
  /** The furthest slide index (0-based) this gesture may currently reach —
   * @prompt-me/core's maxUnlockedClipIndex, computed by the caller from
   * each clip's server-reported completion. */
  maxUnlockedIndex: number;
  children: React.ReactNode;
}

export function LateralScrollLockContainer({
  maxUnlockedIndex,
  children,
}: LateralScrollLockContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const maxIndexRef = useRef(maxUnlockedIndex);
  maxIndexRef.current = maxUnlockedIndex;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function slideWidth() {
      return el!.clientWidth || 1;
    }

    function currentIndex() {
      return Math.round(el!.scrollLeft / slideWidth());
    }

    function preventPastLimit(event: WheelEvent) {
      // Only block a *forward* attempt (positive deltaX — content scrolling
      // left, toward a later clip) once already at the furthest unlocked
      // slide. A negative deltaX (scrolling back toward an earlier clip)
      // always passes through untouched.
      if (event.deltaX > 0 && currentIndex() >= maxIndexRef.current) {
        event.preventDefault();
      }
    }

    // Touch swipes don't carry a wheel event; track the gesture's own
    // horizontal delta so a swipe attempting to pass the limit gets the
    // same treatment as a forward wheel scroll.
    let touchStartX: number | null = null;
    function handleTouchStart(event: TouchEvent) {
      touchStartX = event.touches[0]?.clientX ?? null;
    }
    function handleTouchMove(event: TouchEvent) {
      if (touchStartX === null) return;
      const currentX = event.touches[0]?.clientX ?? touchStartX;
      const movedForward = currentX < touchStartX; // finger moving left = advancing
      if (movedForward && currentIndex() >= maxIndexRef.current) {
        event.preventDefault();
      }
    }

    function snapWithinLimit() {
      const idx = currentIndex();
      if (idx > maxIndexRef.current) {
        el!.scrollTo({ left: maxIndexRef.current * slideWidth(), behavior: "auto" });
      }
    }

    el.addEventListener("wheel", preventPastLimit, { passive: false });
    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchmove", handleTouchMove, { passive: false });
    el.addEventListener("scroll", snapWithinLimit);
    return () => {
      el.removeEventListener("wheel", preventPastLimit);
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("scroll", snapWithinLimit);
    };
  }, []);

  // Whenever the unlocked frontier itself moves forward (a clip just
  // completed), re-run the snap check: a scroll position that was
  // legitimately clamped a moment ago may now be behind the *new* limit,
  // which is fine (nothing to do) — but this also covers the reverse
  // direction never happening, since maxUnlockedIndex only ever grows.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const width = el.clientWidth || 1;
    const idx = Math.round(el.scrollLeft / width);
    if (idx > maxUnlockedIndex) {
      el.scrollTo({ left: maxUnlockedIndex * width, behavior: "auto" });
    }
  }, [maxUnlockedIndex]);

  return (
    <div
      ref={containerRef}
      data-lateral-scroll-container=""
      data-max-unlocked-index={maxUnlockedIndex}
      className="flex w-full overflow-x-auto"
      style={{ scrollSnapType: "x mandatory" }}
    >
      {children}
    </div>
  );
}
