// ROADMAP.md M4/M12: "a dev-mock 'always clean' fallback." Used
// automatically (get-provider.ts) whenever no real OPENAI_API_KEY is
// configured, which is the case for the whole repo today (ROADMAP.md →
// Needs from Sampo).
import type { ModerationCheckOutput, ModerationInput, ModerationProvider } from "./types";

/**
 * Always reports clean, ignoring the actual content entirely — it never
 * even reads `input`. Same rationale as DevMockTranscriptionProvider /
 * DevMockVerificationProvider: there's no real moderation model to run
 * without a credential, so pretending to analyze the content and then
 * declaring it clean would be no more honest than just declaring it clean
 * outright — and a mock that *did* inspect content would stop being
 * deterministic in any meaningful sense.
 */
export class DevMockModerationProvider implements ModerationProvider {
  // Underscore-prefixed and genuinely unused (see doc comment above) —
  // allowed by this package's eslint config's argsIgnorePattern.
  async moderate(_input: ModerationInput): Promise<ModerationCheckOutput> {
    return { flagged: false, categories: [] };
  }
}
