// ROADMAP.md M5 acceptance: "Player enforces no forward-seek; hold-to-2x
// sets playbackRate without jumping currentTime" + "Server... marks
// clip_views.completed = true, driven by reported timeline position."
// These are the pure predicates behind both bullets, tested DOM/DB-free.
import { describe, expect, it } from "vitest";
import {
  COMPLETION_POSITION_TOLERANCE_SECONDS,
  SCROLL_LOCK_SECONDS,
  clampSeekTarget,
  hasClearedScrollLock,
  hasReachedClipEnd,
} from "./playback";

describe("hasReachedClipEnd", () => {
  it("is true at an exact match", () => {
    expect(hasReachedClipEnd(15, 15)).toBe(true);
  });

  it("is true just inside the tolerance window", () => {
    expect(hasReachedClipEnd(15 - COMPLETION_POSITION_TOLERANCE_SECONDS, 15)).toBe(true);
  });

  it("is false just outside the tolerance window", () => {
    expect(hasReachedClipEnd(15 - COMPLETION_POSITION_TOLERANCE_SECONDS - 0.01, 15)).toBe(false);
  });

  it("is false well short of the end", () => {
    expect(hasReachedClipEnd(3, 15)).toBe(false);
  });

  it("is true for a position past the end (e.g. a floating-point overshoot)", () => {
    expect(hasReachedClipEnd(15.2, 15)).toBe(true);
  });

  it("is false for non-finite input rather than throwing", () => {
    expect(hasReachedClipEnd(Number.NaN, 15)).toBe(false);
    expect(hasReachedClipEnd(Infinity, Number.NaN)).toBe(false);
  });
});

describe("hasClearedScrollLock", () => {
  it("clip 1 stays locked until the threshold", () => {
    expect(hasClearedScrollLock(0, true)).toBe(false);
    expect(hasClearedScrollLock(SCROLL_LOCK_SECONDS - 0.01, true)).toBe(false);
  });

  it("clip 1 clears exactly at the threshold and beyond", () => {
    expect(hasClearedScrollLock(SCROLL_LOCK_SECONDS, true)).toBe(true);
    expect(hasClearedScrollLock(SCROLL_LOCK_SECONDS + 10, true)).toBe(true);
  });

  it("any other clip is never locked, even at time 0", () => {
    expect(hasClearedScrollLock(0, false)).toBe(true);
  });
});

describe("clampSeekTarget", () => {
  it("allows a rewind (requested behind the reached max)", () => {
    expect(clampSeekTarget(2, 10)).toBe(2);
  });

  it("allows replay to exactly 0", () => {
    expect(clampSeekTarget(0, 10)).toBe(0);
  });

  it("allows a request exactly at the reached max", () => {
    expect(clampSeekTarget(10, 10)).toBe(10);
  });

  it("clamps a forward-seek request beyond the reached max down to that max", () => {
    expect(clampSeekTarget(9.9, 3)).toBe(3);
  });

  it("clamps a negative request to 0 rather than passing it through", () => {
    expect(clampSeekTarget(-5, 10)).toBe(0);
  });

  it("clamps non-finite requested input to 0 rather than treating it as an unbounded forward seek", () => {
    expect(clampSeekTarget(Number.NaN, 10)).toBe(0);
    expect(clampSeekTarget(Infinity, 10)).toBe(0);
  });
});
