// ROADMAP.md M10: "a dev-mock fallback returning two clearly-fake
// placeholder ideas + rationale when no Anthropic key is configured." Used
// automatically (get-provider.ts) whenever no real ANTHROPIC_API_KEY is
// configured, which is the case for the whole repo today (ROADMAP.md ->
// Needs from Sampo).
import type { DateIdeaGeneratorInput, DateIdeaGeneratorOutput, DateIdeaGeneratorProvider } from "./types";

/**
 * Deliberately, unmistakably fake — "[DEV MOCK]" is not a phrase a real
 * generated idea would ever contain, so this can never be confused with a
 * genuine Claude suggestion at the point of viewing (mirrors
 * DevMockVerificationProvider's / DevMockModerationProvider's own
 * "deterministic, ignores the real input" rationale, applied here with the
 * added requirement — ROADMAP.md's own wording — that the fakeness itself
 * be visible, not just the determinism).
 */
export const DEV_MOCK_DATE_IDEAS: [
  { ideaText: string; rationale: string },
  { ideaText: string; rationale: string },
] = [
  {
    ideaText: "[DEV MOCK] Coffee at a spot roughly between you two",
    rationale: "[DEV MOCK] Low-key first idea — no real Anthropic key is configured in this environment.",
  },
  {
    ideaText: "[DEV MOCK] An afternoon walk somewhere nearby",
    rationale: "[DEV MOCK] Second placeholder idea — set ANTHROPIC_API_KEY to get real Claude-generated ideas.",
  },
];

/**
 * Ignores the actual transcripts/geohash entirely — same "a mock that
 * inspected content would stop being deterministic in any meaningful sense"
 * reasoning DevMockModerationProvider's own comment gives. There is no real
 * generation model to run without a credential, so pretending to read the
 * transcripts and then returning fixed prose anyway would be no more
 * honest than just returning it outright.
 */
export class DevMockDateIdeaGeneratorProvider implements DateIdeaGeneratorProvider {
  // Underscore-prefixed and genuinely unused (see class doc comment above)
  // — allowed by this package's eslint config's argsIgnorePattern.
  async generate(_input: DateIdeaGeneratorInput): Promise<DateIdeaGeneratorOutput> {
    const [first, second] = DEV_MOCK_DATE_IDEAS;
    return { ideas: [{ ...first }, { ...second }] };
  }
}
