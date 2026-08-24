import { afterEach, describe, expect, it } from "vitest";
import { isOpenAiModerationConfigured } from "./config";

const original = process.env.OPENAI_API_KEY;

afterEach(() => {
  if (original === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = original;
});

describe("isOpenAiModerationConfigured", () => {
  it("is false with no OPENAI_API_KEY (the ROADMAP.md default — no real key exists yet)", () => {
    delete process.env.OPENAI_API_KEY;
    expect(isOpenAiModerationConfigured()).toBe(false);
  });

  it("is false for an empty string (falsy, not just unset)", () => {
    process.env.OPENAI_API_KEY = "";
    expect(isOpenAiModerationConfigured()).toBe(false);
  });

  it("is true once a key is set", () => {
    process.env.OPENAI_API_KEY = "sk-test-key";
    expect(isOpenAiModerationConfigured()).toBe(true);
  });
});
