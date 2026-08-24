// ENGINEERING_SPEC.md §10: "Pipeline: pull both matched users' clips.transcript
// -> single Claude call with both transcript sets + the match's shared
// geohash cell -> two generated ideas + a one-line rationale each." Mirrors
// verification/types.ts's / moderation/types.ts's shape exactly: a
// framework/DB-free adapter interface, two implementations selected by
// get-provider.ts based on whether a real Anthropic key is configured
// (config.ts).

/** One generated date idea plus the one-line reason it was suggested —
 * SPEC.md §7 / ENGINEERING_SPEC §10's "two generated ideas + a one-line
 * rationale each." Both fields are always non-empty prose, never IDs or
 * enum-like values — this is exactly what gets denormalized into
 * `date_proposals.idea_text` (packages/db/src/schema/date-proposals.ts's
 * own header comment) if a proposer picks it. */
export interface GeneratedIdea {
  ideaText: string;
  rationale: string;
}

/**
 * Input to a single generation call. `transcriptsA`/`transcriptsB` are each
 * matched user's own `clips.transcript` values, already filtered to the
 * non-null ones a caller actually has (a clip whose transcription hasn't
 * completed yet simply isn't included — this module has no opinion about
 * that filtering, it only ever sees strings). `sharedGeohashCell` is the
 * match's shared location context — null when neither matched user has a
 * captured location yet (@prompt-me/core's location/shared-cell.ts computes
 * this from both users' `geohash5` values before a call is ever made).
 */
export interface DateIdeaGeneratorInput {
  transcriptsA: string[];
  transcriptsB: string[];
  /** Length-5 geohash cell string, or null if unknown — never a raw
   * lat/lon (ENGINEERING_SPEC §6's fuzzing rule applies transitively here:
   * nothing upstream of this input ever holds a raw coordinate). */
  sharedGeohashCell: string | null;
}

/**
 * Output of a single generation call. `ideas` is always exactly two
 * elements — ENGINEERING_SPEC §10 / ROADMAP.md M10's acceptance bullet:
 * "the Claude call returns exactly two ideas with a rationale each." Both
 * implementations (dev-mock-provider.ts, claude-provider.ts) validate this
 * themselves before returning rather than trusting a caller to check array
 * length — see contract.test.ts, which asserts the same two-items,
 * both-fields-non-empty shape against both providers with identical mocked
 * input.
 */
export interface DateIdeaGeneratorOutput {
  ideas: [GeneratedIdea, GeneratedIdea];
}

/** ENGINEERING_SPEC §10's adapter: two implementations — a deterministic
 * dev-mock (dev-mock-provider.ts, "two clearly-fake placeholder ideas +
 * rationale") and a real Claude-backed one (claude-provider.ts) — selected
 * by get-provider.ts based on whether an Anthropic API key is configured
 * (config.ts). */
export interface DateIdeaGeneratorProvider {
  generate(input: DateIdeaGeneratorInput): Promise<DateIdeaGeneratorOutput>;
}
