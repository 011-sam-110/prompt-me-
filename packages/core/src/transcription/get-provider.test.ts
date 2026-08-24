import { afterEach, describe, expect, it } from "vitest";
import { DevMockTranscriptionProvider } from "./dev-mock-provider";
import { getTranscriptionProvider } from "./get-provider";
import { OpenAiWhisperTranscriptionProvider } from "./whisper-provider";

const KEYS = ["OPENAI_API_KEY", "OPENAI_API_BASE_URL"] as const;
const original = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

afterEach(() => {
  for (const k of KEYS) {
    if (original[k] === undefined) delete process.env[k];
    else process.env[k] = original[k];
  }
});

describe("getTranscriptionProvider", () => {
  it("returns the dev-mock when no OpenAI key is configured (ROADMAP.md M4 default)", () => {
    delete process.env.OPENAI_API_KEY;
    expect(getTranscriptionProvider()).toBeInstanceOf(DevMockTranscriptionProvider);
  });

  it("returns the real Whisper provider once a key is configured", () => {
    process.env.OPENAI_API_KEY = "sk-test-key";
    expect(getTranscriptionProvider()).toBeInstanceOf(OpenAiWhisperTranscriptionProvider);
  });
});
