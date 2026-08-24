import { afterEach, describe, expect, it } from "vitest";
import { DevMockDateIdeaGeneratorProvider } from "./dev-mock-provider";
import { getDateIdeaGeneratorProvider } from "./get-provider";
import { ClaudeDateIdeaGeneratorProvider } from "./claude-provider";

const original = process.env.ANTHROPIC_API_KEY;

afterEach(() => {
  if (original === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = original;
});

describe("getDateIdeaGeneratorProvider", () => {
  it("returns the dev-mock when no Anthropic key is configured (ROADMAP.md M10 default)", () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(getDateIdeaGeneratorProvider()).toBeInstanceOf(DevMockDateIdeaGeneratorProvider);
  });

  it("returns the real Claude-backed provider once a key is configured", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";
    expect(getDateIdeaGeneratorProvider()).toBeInstanceOf(ClaudeDateIdeaGeneratorProvider);
  });
});
