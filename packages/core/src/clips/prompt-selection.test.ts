import { describe, expect, it } from "vitest";
import { validatePromptSelection } from "./prompt-selection";

describe("validatePromptSelection", () => {
  it("accepts a valid promptId matching the tier and active", () => {
    const result = validatePromptSelection({
      tier: 2,
      promptId: "prompt-1",
      resolvedPrompt: { tier: 2, isActive: true },
    });
    expect(result).toEqual({ ok: true });
  });

  it("accepts non-empty custom prompt text with no promptId", () => {
    const result = validatePromptSelection({
      tier: 1,
      customPromptText: "What's a sound that makes you happy?",
    });
    expect(result).toEqual({ ok: true });
  });

  it("rejects neither promptId nor customPromptText given", () => {
    const result = validatePromptSelection({ tier: 1 });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/exactly one/i);
  });

  it("rejects both promptId and customPromptText given", () => {
    const result = validatePromptSelection({
      tier: 1,
      promptId: "prompt-1",
      customPromptText: "also this",
      resolvedPrompt: { tier: 1, isActive: true },
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/exactly one/i);
  });

  it("rejects whitespace-only customPromptText as if it were empty", () => {
    const result = validatePromptSelection({ tier: 1, customPromptText: "   " });
    expect(result.ok).toBe(false);
  });

  it("rejects a promptId that doesn't resolve to any prompt", () => {
    const result = validatePromptSelection({ tier: 1, promptId: "missing", resolvedPrompt: null });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/existing prompt/i);
  });

  it("rejects a promptId resolving to an inactive prompt", () => {
    const result = validatePromptSelection({
      tier: 1,
      promptId: "retired",
      resolvedPrompt: { tier: 1, isActive: false },
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/retired/i);
  });

  it("rejects a promptId whose tier doesn't match the upload's tier", () => {
    const result = validatePromptSelection({
      tier: 3,
      promptId: "tier-2-prompt",
      resolvedPrompt: { tier: 2, isActive: true },
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/tier 2.*tier 3/);
  });

  it("rejects custom prompt text over the length cap", () => {
    const result = validatePromptSelection({ tier: 1, customPromptText: "x".repeat(281) });
    expect(result.ok).toBe(false);
  });

  it("accepts custom prompt text right at the length cap", () => {
    const result = validatePromptSelection({ tier: 1, customPromptText: "x".repeat(280) });
    expect(result.ok).toBe(true);
  });
});
