// ROADMAP.md M4: "a dev-mock fallback returning placeholder transcript
// text when no OpenAI key is present." Used automatically (get-provider.ts)
// whenever no real OPENAI_API_KEY is configured, which is the case for the
// whole repo today (ROADMAP.md → Needs from Sampo).
import type { TranscriptionInput, TranscriptionOutput, TranscriptionProvider } from "./types";

/**
 * Fixed placeholder text the dev-mock always returns — deliberately
 * distinctive (not a plausible-looking real transcript) so nothing
 * downstream could mistake it for real Whisper output, and never derived
 * from the actual audio: this provider never even reads `input`, the same
 * "genuinely deterministic, ignores its input" shape as
 * DevMockVerificationProvider.
 */
export const DEV_MOCK_TRANSCRIPT_TEXT =
  "[dev-mock transcript — no OPENAI_API_KEY configured, audio was never sent anywhere]";

export class DevMockTranscriptionProvider implements TranscriptionProvider {
  // Underscore-prefixed and genuinely unused (see doc comment above) —
  // allowed by this package's eslint config's argsIgnorePattern.
  async transcribe(_input: TranscriptionInput): Promise<TranscriptionOutput> {
    return { transcript: DEV_MOCK_TRANSCRIPT_TEXT };
  }
}
