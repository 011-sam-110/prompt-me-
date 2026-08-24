import { describe, expect, it } from "vitest";
import { CLIP_DURATION_TOLERANCE_SECONDS, CLIP_TIER_SPECS, isDurationWithinTolerance, isValidClipTier } from "./tiers";

describe("isValidClipTier", () => {
  it("accepts 1-4", () => {
    expect(isValidClipTier(1)).toBe(true);
    expect(isValidClipTier(4)).toBe(true);
  });

  it("rejects anything outside 1-4", () => {
    expect(isValidClipTier(0)).toBe(false);
    expect(isValidClipTier(5)).toBe(false);
    expect(isValidClipTier(1.5)).toBe(false);
  });
});

describe("isDurationWithinTolerance", () => {
  it("accepts the exact target for every tier", () => {
    for (const [tier, spec] of Object.entries(CLIP_TIER_SPECS)) {
      expect(isDurationWithinTolerance(Number(tier) as 1 | 2 | 3 | 4, spec.durationSeconds)).toBe(true);
    }
  });

  it("accepts up to and including the ±0.5s boundary", () => {
    expect(isDurationWithinTolerance(1, 15 - CLIP_DURATION_TOLERANCE_SECONDS)).toBe(true);
    expect(isDurationWithinTolerance(1, 15 + CLIP_DURATION_TOLERANCE_SECONDS)).toBe(true);
  });

  it("rejects just outside the tolerance", () => {
    expect(isDurationWithinTolerance(1, 15 - CLIP_DURATION_TOLERANCE_SECONDS - 0.01)).toBe(false);
    expect(isDurationWithinTolerance(1, 15 + CLIP_DURATION_TOLERANCE_SECONDS + 0.01)).toBe(false);
  });

  it("checks each tier against its own target, not tier 1's", () => {
    expect(isDurationWithinTolerance(2, 30)).toBe(true);
    expect(isDurationWithinTolerance(2, 15)).toBe(false);
    expect(isDurationWithinTolerance(3, 120)).toBe(true);
    expect(isDurationWithinTolerance(4, 180)).toBe(true);
  });
});
