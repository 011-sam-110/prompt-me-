// ROADMAP.md M10's acceptance bullet, read literally: "Given two mocked
// transcript sets + a shared geohash, the Claude call returns exactly two
// ideas with a rationale each." This file runs that exact assertion against
// BOTH adapter implementations (get-provider.ts's two branches) with the
// identical mocked input — the dev-mock path for real (it needs no
// stubbing at all), and the Claude path with its SDK client injected
// (claude-provider.test.ts's own fakeClient shape) so the contract is
// proven end-to-end without a real ANTHROPIC_API_KEY.
import { describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { ClaudeDateIdeaGeneratorProvider, SUBMIT_DATE_IDEAS_TOOL_NAME } from "./claude-provider";
import { DevMockDateIdeaGeneratorProvider } from "./dev-mock-provider";
import type { DateIdeaGeneratorInput, DateIdeaGeneratorProvider } from "./types";

const MOCKED_INPUT: DateIdeaGeneratorInput = {
  transcriptsA: [
    "My favorite prompt was about my worst first date — it involved a llama.",
    "I'm happiest hiking somewhere with a proper view.",
  ],
  transcriptsB: [
    "I once cried at a planetarium show, no regrets.",
    "Terrible cook, great at finding the best coffee shop in any city.",
  ],
  sharedGeohashCell: "gcpvj0",
};

function fakeClaudeClient(): Anthropic {
  const create = vi.fn().mockResolvedValue({
    id: "msg_contract_test",
    stop_reason: "tool_use",
    content: [
      {
        type: "tool_use",
        id: "toolu_contract_test",
        name: SUBMIT_DATE_IDEAS_TOOL_NAME,
        input: {
          ideas: [
            { ideaText: "A short hike ending at a coffee shop with a view", rationale: "Combines her hiking love with his coffee-shop scouting." },
            { ideaText: "An evening at the local planetarium", rationale: "Echoes the planetarium story from his transcript." },
          ],
        },
      },
    ],
  });
  return { messages: { create } } as unknown as Anthropic;
}

const PROVIDERS: Array<[string, () => DateIdeaGeneratorProvider]> = [
  ["DevMockDateIdeaGeneratorProvider", () => new DevMockDateIdeaGeneratorProvider()],
  [
    "ClaudeDateIdeaGeneratorProvider",
    () => new ClaudeDateIdeaGeneratorProvider({ apiKey: "sk-ant-test", client: fakeClaudeClient() }),
  ],
];

describe.each(PROVIDERS)("date-idea generator adapter contract — %s", (_name, makeProvider) => {
  it("returns exactly two ideas, each with a non-empty rationale, given mocked transcripts + a shared geohash", async () => {
    const provider = makeProvider();
    const output = await provider.generate(MOCKED_INPUT);

    expect(output.ideas).toHaveLength(2);
    for (const idea of output.ideas) {
      expect(typeof idea.ideaText).toBe("string");
      expect(idea.ideaText.trim().length).toBeGreaterThan(0);
      expect(typeof idea.rationale).toBe("string");
      expect(idea.rationale.trim().length).toBeGreaterThan(0);
    }
  });
});
