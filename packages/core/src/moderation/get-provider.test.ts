import { afterEach, describe, expect, it } from "vitest";
import { DevMockModerationProvider } from "./dev-mock-provider";
import { getModerationProvider } from "./get-provider";
import { OpenAiOmniModerationProvider } from "./omni-moderation-provider";

const KEYS = ["OPENAI_API_KEY", "OPENAI_API_BASE_URL"] as const;
const original = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

afterEach(() => {
  for (const k of KEYS) {
    if (original[k] === undefined) delete process.env[k];
    else process.env[k] = original[k];
  }
});

describe("getModerationProvider", () => {
  it("returns the dev-mock when no OpenAI key is configured (ROADMAP.md M4/M12 default)", () => {
    delete process.env.OPENAI_API_KEY;
    expect(getModerationProvider()).toBeInstanceOf(DevMockModerationProvider);
  });

  it("returns the real omni-moderation provider once a key is configured", () => {
    process.env.OPENAI_API_KEY = "sk-test-key";
    expect(getModerationProvider()).toBeInstanceOf(OpenAiOmniModerationProvider);
  });
});
