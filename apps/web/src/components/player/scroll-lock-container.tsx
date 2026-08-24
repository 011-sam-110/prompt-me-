"use client";
// SPEC.md §3: "Vertical scroll = move to the next candidate. This is the
// pass gesture. Locked for the first 5 seconds of clip 1." A generic
// vertical scroll-lock primitive — takes `locked` as a prop rather than
// deriving it itself, so it stays reusable once M6 wires a real candidate
// feed on top of it (this component has no opinion on *why* it's locked,
// only on enforcing whatever `locked` currently says).
//
// Two layers of enforcement, not one: `wheel`/`touchmove` listeners
// preventDefault while locked (stops the scroll before it happens at all
// for the two real input paths this app cares about), and a `scroll`
// listener snaps `scrollTop` back to 0 if anything still moved it —
// belt-and-suspenders against any other way a scroll could sneak through.
import { useEffect, useRef } from "react";

export interface ScrollLockContainerProps {
  locked: boolean;
  children: React.ReactNode;
}

export function ScrollLockContainer({ locked, children }: ScrollLockContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const lockedRef = useRef(locked);
  lockedRef.current = locked;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function preventWhileLocked(event: Event) {
      if (lockedRef.current) {
        event.preventDefault();
      }
    }

    function snapBackWhileLocked() {
      if (lockedRef.current && el && el.scrollTop !== 0) {
        el.scrollTop = 0;
      }
    }

    el.addEventListener("wheel", preventWhileLocked, { passive: false });
    el.addEventListener("touchmove", preventWhileLocked, { passive: false });
    el.addEventListener("scroll", snapBackWhileLocked);
    return () => {
      el.removeEventListener("wheel", preventWhileLocked);
      el.removeEventListener("touchmove", preventWhileLocked);
      el.removeEventListener("scroll", snapBackWhileLocked);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      data-scroll-lock-container=""
      data-scroll-locked={locked ? "true" : "false"}
      className="h-[70vh] w-full max-w-sm overflow-y-auto"
      style={{ scrollSnapType: locked ? "none" : "y mandatory" }}
    >
      {children}
    </div>
  );
}
