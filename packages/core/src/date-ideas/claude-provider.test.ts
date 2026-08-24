// Unit tests for our own request/response handling — not a claim that this
// matches Anthropic's real API (see claude-provider.ts's top comment: no
// live key exists yet to verify that against). The SDK client itself is
// injected (constructor's `client` override) rather than stubbing global
// `fetch` — this adapter is built on `@anthropic-ai/sdk`, not a bare
// `fetch` call, so the client instance is the actual seam, mirroring how
// verification/didit-provider.test.ts and
// moderation/omni-moderation-provider.test.ts stub the seam their own
// fetch-based adapters have.
import { describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { CLAUDE_DATE_IDEAS_MODEL, ClaudeDateIdeaGeneratorProvider, SUBMIT_DATE_IDEAS_TOOL_NAME } from "./claude-provider";

function fakeClient(createImpl: () => unknown): Anthropic {
  return { messages: { create: vi.fn(createImpl) } } as unknown as Anthropic;
}

function toolUseResponse(input: unknown, stopReason = "tool_use") {
  return {
    id: "msg_test",
    content: [
      { type: "tool_use", id: "toolu_test", name: SUBMIT_DATE_IDEAS_TOOL_NAME, input },
    ],
    stop_reason: stopReason,
  };
}

describe("ClaudeDateIdeaGeneratorProvider", () => {
  it("sends both transcript sets and the shared geohash cell, calls the submit_date_ideas tool", async () => {
    const create = vi.fn().mockResolvedValue(
      toolUseResponse({
        ideas: [
          { ideaText: "Coffee at the harbourside café", rationale: "Both mentioned loving coffee." },
          { ideaText: "A walk around the botanic gardens", rationale: "Both mentioned enjoying nature." },
        ],
      }),
    );
    const client = { messages: { create } } as unknown as Anthropic;
    const provider = new ClaudeDateIdeaGeneratorProvider({ apiKey: "sk-ant-test", client });

    await provider.generate({
      transcriptsA: ["I love a good flat white."],
      transcriptsB: ["Nothing beats a coffee shop first date."],
      sharedGeohashCell: "gcpvj",
    });

    expect(create).toHaveBeenCalledTimes(1);
    const call = create.mock.calls[0]![0] as Anthropic.MessageCreateParams;
    expect(call.model).toBe(CLAUDE_DATE_IDEAS_MODEL);
    expect((call.tools?.[0] as Anthropic.Tool | undefined)?.name).toBe(SUBMIT_DATE_IDEAS_TOOL_NAME);
    const userContent = call.messages[0]!.content as string;
    expect(userContent).toContain("I love a good flat white.");
    expect(userContent).toContain("Nothing beats a coffee shop first date.");
    expect(userContent).toContain("gcpvj");
  });

  it("says the area is unknown when sharedGeohashCell is null", async () => {
    const client = fakeClient(() =>
      Promise.resolve(
        toolUseResponse({
          ideas: [
            { ideaText: "a", rationale: "b" },
            { ideaText: "c", rationale: "d" },
          ],
        }),
      ),
    );
    const provider = new ClaudeDateIdeaGeneratorProvider({ apiKey: "sk-ant-test", client });

    await provider.generate({ transcriptsA: [], transcriptsB: [], sharedGeohashCell: null });

    const create = client.messages.create as unknown as ReturnType<typeof vi.fn>;
    const call = create.mock.calls[0]![0] as Anthropic.MessageCreateParams;
    const userContent = call.messages[0]!.content as string;
    expect(userContent.toLowerCase()).toContain("not known");
  });

  it("maps a valid tool call to exactly two trimmed ideas", async () => {
    const client = fakeClient(() =>
      Promise.resolve(
        toolUseResponse({
          ideas: [
            { ideaText: "  Idea one  ", rationale: "  Rationale one  " },
            { ideaText: "Idea two", rationale: "Rationale two" },
          ],
        }),
      ),
    );
    const provider = new ClaudeDateIdeaGeneratorProvider({ apiKey: "sk-ant-test", client });

    const output = await provider.generate({ transcriptsA: [], transcriptsB: [], sharedGeohashCell: null });

    expect(output.ideas).toHaveLength(2);
    expect(output.ideas[0]).toEqual({ ideaText: "Idea one", rationale: "Rationale one" });
    expect(output.ideas[1]).toEqual({ ideaText: "Idea two", rationale: "Rationale two" });
  });

  it("throws when the model returns no tool_use block at all", async () => {
    const client = fakeClient(() =>
      Promise.resolve({ id: "msg_test", content: [{ type: "text", text: "I refuse." }], stop_reason: "end_turn" }),
    );
    const provider = new ClaudeDateIdeaGeneratorProvider({ apiKey: "sk-ant-test", client });

    await expect(provider.generate({ transcriptsA: [], transcriptsB: [], sharedGeohashCell: null })).rejects.toThrow(
      /expected a submit_date_ideas tool call/,
    );
  });

  it("throws when the tool call has the wrong number of ideas", async () => {
    const client = fakeClient(() =>
      Promise.resolve(toolUseResponse({ ideas: [{ ideaText: "only one", rationale: "x" }] })),
    );
    const provider = new ClaudeDateIdeaGeneratorProvider({ apiKey: "sk-ant-test", client });

    await expect(provider.generate({ transcriptsA: [], transcriptsB: [], sharedGeohashCell: null })).rejects.toThrow(
      /expected a submit_date_ideas tool call/,
    );
  });

  it("throws when an idea is missing its rationale", async () => {
    const client = fakeClient(() =>
      Promise.resolve(
        toolUseResponse({
          ideas: [
            { ideaText: "a", rationale: "" },
            { ideaText: "c", rationale: "d" },
          ],
        }),
      ),
    );
    const provider = new ClaudeDateIdeaGeneratorProvider({ apiKey: "sk-ant-test", client });

    await expect(provider.generate({ transcriptsA: [], transcriptsB: [], sharedGeohashCell: null })).rejects.toThrow(
      /expected a submit_date_ideas tool call/,
    );
  });
});
