import { afterEach, describe, expect, it } from "vitest";
import { isAnthropicConfigured } from "./config";

const original = process.env.ANTHROPIC_API_KEY;

afterEach(() => {
  if (original === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = original;
});

describe("isAnthropicConfigured", () => {
  it("is false with no ANTHROPIC_API_KEY (the ROADMAP.md default — no real key exists yet)", () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(isAnthropicConfigured()).toBe(false);
  });

  it("is false for an empty string (falsy, not just unset)", () => {
    process.env.ANTHROPIC_API_KEY = "";
    expect(isAnthropicConfigured()).toBe(false);
  });

  it("is true once a key is set", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";
    expect(isAnthropicConfigured()).toBe(true);
  });
});
