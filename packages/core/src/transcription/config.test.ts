import { afterEach, describe, expect, it } from "vitest";
import { isOpenAiTranscriptionConfigured } from "./config";

const original = process.env.OPENAI_API_KEY;

afterEach(() => {
  if (original === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = original;
});

describe("isOpenAiTranscriptionConfigured", () => {
  it("is false with no OPENAI_API_KEY (the ROADMAP.md default — no real key exists yet)", () => {
    delete process.env.OPENAI_API_KEY;
    expect(isOpenAiTranscriptionConfigured()).toBe(false);
  });

  it("is false for an empty string (falsy, not just unset)", () => {
    process.env.OPENAI_API_KEY = "";
    expect(isOpenAiTranscriptionConfigured()).toBe(false);
  });

  it("is true once a key is set", () => {
    process.env.OPENAI_API_KEY = "sk-test-key";
    expect(isOpenAiTranscriptionConfigured()).toBe(true);
  });
});
