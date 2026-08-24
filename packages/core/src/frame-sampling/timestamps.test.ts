import { describe, expect, it } from "vitest";
import { computeFrameSampleTimestamps } from "./timestamps";

describe("computeFrameSampleTimestamps", () => {
  it("samples every 10s for a tier-2 30s clip (SPEC.md's shortest video tier)", () => {
    expect(computeFrameSampleTimestamps(30)).toEqual([0, 10, 20]);
  });

  it("samples 12 frames for a tier-3 120s clip", () => {
    const result = computeFrameSampleTimestamps(120);
    expect(result).toHaveLength(12);
    expect(result[0]).toBe(0);
    expect(result[result.length - 1]).toBe(110);
  });

  it("samples 18 frames for a tier-4 180s clip", () => {
    expect(computeFrameSampleTimestamps(180)).toHaveLength(18);
  });

  it("rounds up a non-exact multiple of the interval (25s -> 3 frames, not 2.5)", () => {
    expect(computeFrameSampleTimestamps(25)).toEqual([0, 10, 20]);
  });

  it("still samples exactly one frame for a clip shorter than the interval", () => {
    expect(computeFrameSampleTimestamps(5)).toEqual([0]);
  });

  it("samples nothing for a zero or negative duration", () => {
    expect(computeFrameSampleTimestamps(0)).toEqual([]);
    expect(computeFrameSampleTimestamps(-1)).toEqual([]);
  });

  it("respects a custom interval", () => {
    expect(computeFrameSampleTimestamps(20, 5)).toEqual([0, 5, 10, 15]);
  });
});
