import { describe, expect, it } from "vitest";
import { checkTierDependency } from "./dependency";

describe("checkTierDependency", () => {
  it("tier 1 never depends on anything, even with no prior clips", () => {
    expect(checkTierDependency([], 1)).toEqual({ ok: true });
  });

  it("tier N is allowed once tier N-1 exists", () => {
    expect(checkTierDependency([1], 2)).toEqual({ ok: true });
    expect(checkTierDependency([1, 2], 3)).toEqual({ ok: true });
    expect(checkTierDependency([1, 2, 3], 4)).toEqual({ ok: true });
  });

  it("rejects tier N when tier N-1 is missing, even if other tiers exist", () => {
    const result = checkTierDependency([1], 3);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/tier 3/);
    expect(result.reason).toMatch(/tier 2/);
  });

  it("rejects tier 2 with no clips uploaded at all", () => {
    expect(checkTierDependency([], 2).ok).toBe(false);
  });

  it("order of existingTiers doesn't matter", () => {
    expect(checkTierDependency([3, 1, 2], 4)).toEqual({ ok: true });
  });
});
