// ENGINEERING_SPEC.md §10: "single Claude call with both transcript sets +
// the match's shared geohash cell -> two generated ideas + a one-line
// rationale each." No live ANTHROPIC_API_KEY exists yet (ROADMAP.md ->
// Needs from Sampo), so this has never run against Anthropic's real API —
// same "best-effort placeholder, treat as provisional" caveat as
// ../verification/didit-provider.ts's and ../moderation/omni-moderation-provider.ts's
// own top comments.
//
// Uses the official `@anthropic-ai/sdk` rather than a hand-rolled `fetch`
// call — unlike this repo's other adapters (Didit, OpenAI), which predate
// this project having a documented "always use the official SDK" rule for
// Claude integrations. A forced `tool_choice` is deliberately NOT used even
// though it would guarantee a tool call: extended-thinking models have
// historically restricted `tool_choice` to "auto"/"none" (not a specific
// tool), and Claude Opus 5 runs adaptive thinking by default — so this
// leaves `tool_choice` at its "auto" default, gets the same structural
// guarantee from `strict: true` on the one tool offered, and backs that
// with this file's own runtime validation (isSubmitDateIdeasToolInput)
// rather than trusting the API to have accepted a forced-tool request that
// was never verified against a real key.
import Anthropic from "@anthropic-ai/sdk";
import type { DateIdeaGeneratorInput, DateIdeaGeneratorOutput, DateIdeaGeneratorProvider, GeneratedIdea } from "./types";

/** claude-api skill's current model table (cached 2026-06-24): "ALWAYS use
 * claude-opus-5 unless the user explicitly names a different model." No
 * model was named for this feature, so this is that default, not a
 * cost-driven choice — never swap it for a cheaper model without that
 * being an explicit instruction. */
export const CLAUDE_DATE_IDEAS_MODEL = "claude-opus-5";

export const SUBMIT_DATE_IDEAS_TOOL_NAME = "submit_date_ideas";

/**
 * The one tool offered on every call — its `input_schema` is the actual
 * mechanism that makes "exactly two ideas, each with a rationale"
 * (ENGINEERING_SPEC §10) a structural guarantee rather than a prompting
 * hope: `strict: true` (additionalProperties: false + required, per the
 * claude-api skill's "Strict tool use" reference) validates the model's
 * `tool_use.input` against this schema before it ever reaches
 * isSubmitDateIdeasToolInput below.
 */
const SUBMIT_DATE_IDEAS_TOOL: Anthropic.Tool = {
  name: SUBMIT_DATE_IDEAS_TOOL_NAME,
  description:
    "Submit exactly two date ideas for this match, each with a short one-line rationale explaining why it fits what both people talked about (and, if given, where they both are).",
  input_schema: {
    type: "object",
    properties: {
      ideas: {
        type: "array",
        minItems: 2,
        maxItems: 2,
        items: {
          type: "object",
          properties: {
            ideaText: {
              type: "string",
              description: "A short, concrete date idea (e.g. an activity and rough setting), one or two sentences.",
            },
            rationale: {
              type: "string",
              description: "One sentence explaining why this idea fits the two people's transcripts and/or shared area.",
            },
          },
          required: ["ideaText", "rationale"],
          additionalProperties: false,
        },
      },
    },
    required: ["ideas"],
    additionalProperties: false,
  },
  strict: true,
};

const SYSTEM_PROMPT =
  "You help a voice-first dating app suggest first-date ideas. You are given short " +
  "spoken-prompt transcripts from each of two people who have matched, and (if known) " +
  "the general area they're both in. Suggest exactly two distinct, low-pressure, " +
  "public-place date ideas grounded in real details from what they said — not generic " +
  "filler. Keep each idea to one or two sentences and each rationale to one sentence. " +
  "You must respond by calling the submit_date_ideas tool exactly once, with exactly " +
  "two ideas — never plain text.";

function formatTranscripts(transcripts: string[]): string {
  if (transcripts.length === 0) {
    return "(no transcripts available yet)";
  }
  return transcripts.map((t, i) => `${i + 1}. ${t}`).join("\n");
}

function buildUserPrompt(input: DateIdeaGeneratorInput): string {
  const areaLine =
    input.sharedGeohashCell === null
      ? "Shared area: not known yet."
      : `Shared area (geohash cell): ${input.sharedGeohashCell}`;

  return [
    "Person A's clip transcripts:",
    formatTranscripts(input.transcriptsA),
    "",
    "Person B's clip transcripts:",
    formatTranscripts(input.transcriptsB),
    "",
    areaLine,
  ].join("\n");
}

interface SubmitDateIdeasToolInput {
  ideas: GeneratedIdea[];
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Re-validates the tool call's `input` at the application layer rather than
 * trusting `strict: true` alone — the same "don't just trust the schema
 * flag, check the actual shape" posture set-venue.ts's own comment
 * documents for a Places result. Anything that fails this (missing tool
 * call at all, wrong item count, blank strings) throws rather than silently
 * padding/truncating to two — a caller regenerating ideas needs to know the
 * call didn't hold its contract, not receive quietly-wrong data.
 */
function isSubmitDateIdeasToolInput(value: unknown): value is SubmitDateIdeasToolInput {
  if (typeof value !== "object" || value === null) return false;
  const ideas = (value as Record<string, unknown>).ideas;
  if (!Array.isArray(ideas) || ideas.length !== 2) return false;
  return ideas.every(
    (idea) =>
      typeof idea === "object" &&
      idea !== null &&
      isNonEmptyString((idea as Record<string, unknown>).ideaText) &&
      isNonEmptyString((idea as Record<string, unknown>).rationale),
  );
}

export interface ClaudeDateIdeaGeneratorProviderConfig {
  apiKey: string;
  /** Injected client, for tests — mirrors the shape every other
   * config-object-constructed adapter in this repo takes, but this is the
   * one adapter here built on an official SDK client rather than a bare
   * `fetch`, so the seam is the client instance itself rather than a
   * `baseUrl` string. Production code never passes this. */
  client?: Anthropic;
}

export class ClaudeDateIdeaGeneratorProvider implements DateIdeaGeneratorProvider {
  private readonly client: Anthropic;

  constructor(config: ClaudeDateIdeaGeneratorProviderConfig) {
    this.client = config.client ?? new Anthropic({ apiKey: config.apiKey });
  }

  async generate(input: DateIdeaGeneratorInput): Promise<DateIdeaGeneratorOutput> {
    // max_tokens is generous relative to the tiny expected JSON output
    // (two short ideas) specifically because Claude Opus 5 runs adaptive
    // thinking by default (claude-api skill's model table) and thinking
    // tokens draw from the same budget — a tight max_tokens here would risk
    // truncating mid-thought before the tool call is ever emitted.
    const response = await this.client.messages.create({
      model: CLAUDE_DATE_IDEAS_MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserPrompt(input) }],
      tools: [SUBMIT_DATE_IDEAS_TOOL],
    });

    const toolUseBlock = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === SUBMIT_DATE_IDEAS_TOOL_NAME,
    );

    if (!toolUseBlock || !isSubmitDateIdeasToolInput(toolUseBlock.input)) {
      throw new Error(
        `ClaudeDateIdeaGeneratorProvider: expected a ${SUBMIT_DATE_IDEAS_TOOL_NAME} tool call with exactly two ideas, stop_reason=${response.stop_reason}`,
      );
    }

    const [first, second] = toolUseBlock.input.ideas;
    return {
      ideas: [
        { ideaText: first!.ideaText.trim(), rationale: first!.rationale.trim() },
        { ideaText: second!.ideaText.trim(), rationale: second!.rationale.trim() },
      ],
    };
  }
}
