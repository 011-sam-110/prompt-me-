import { describe, expect, it } from "vitest";
import { hasCompletedAllClips } from "./mutual-completion";

describe("hasCompletedAllClips", () => {
  it("returns false for an owner with no clips at all — nothing to have completed", () => {
    expect(hasCompletedAllClips([], new Set())).toBe(false);
    expect(hasCompletedAllClips([], new Set(["some-other-clip"]))).toBe(false);
  });

  it("returns false when only some of the owner's clips are completed", () => {
    expect(hasCompletedAllClips(["clip-1", "clip-2", "clip-3"], new Set(["clip-1", "clip-2"]))).toBe(
      false,
    );
  });

  it("returns false when none of the owner's clips are completed", () => {
    expect(hasCompletedAllClips(["clip-1"], new Set())).toBe(false);
  });

  it("returns true once every one of the owner's clips is completed", () => {
    expect(hasCompletedAllClips(["clip-1", "clip-2", "clip-3"], new Set(["clip-1", "clip-2", "clip-3"]))).toBe(
      true,
    );
  });

  it("extra completed ids beyond the owner's clip set don't matter", () => {
    expect(
      hasCompletedAllClips(["clip-1"], new Set(["clip-1", "clip-from-a-different-profile"])),
    ).toBe(true);
  });

  it("a single-clip owner counts as complete once that one clip is completed", () => {
    expect(hasCompletedAllClips(["clip-1"], new Set(["clip-1"]))).toBe(true);
  });
});
