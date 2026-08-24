// ENGINEERING_SPEC.md §1/§12: "Moderation: OpenAI `omni-moderation-latest`
// (accepts both text and image input in one call) — text on transcripts,
// images on sampled video frames." One provider method handles either kind
// of input — the real omni-moderation endpoint accepts the same request
// shape for both; §1's "in one call" describes the model accepting mixed
// content types, not a requirement that this codebase batch every check
// into a single HTTP request (see omni-moderation-provider.ts for why
// per-item calls are simpler to reason about and test here).
export type ModerationInput = { type: "text"; text: string } | { type: "image"; imageDataUrl: string };

/**
 * One category's result — `category` is populated straight from the
 * provider's own taxonomy label (e.g. "sexual", "harassment/threatening",
 * "violence"), matching packages/db's moderation_flags.flag_type column
 * comment ("populated directly from the moderation provider's own
 * category label").
 */
export interface ModerationCategoryResult {
  category: string;
  flagged: boolean;
  /** 0.0-1.0 confidence score for this category specifically. */
  score: number;
}

export interface ModerationCheckOutput {
  flagged: boolean;
  categories: ModerationCategoryResult[];
}

/** ENGINEERING_SPEC §12's adapter: two implementations — a deterministic
 * "always clean" dev-mock (dev-mock-provider.ts) and a real
 * omni-moderation-backed one (omni-moderation-provider.ts) — selected by
 * get-provider.ts based on whether an OpenAI API key is configured
 * (config.ts). */
export interface ModerationProvider {
  moderate(input: ModerationInput): Promise<ModerationCheckOutput>;
}
