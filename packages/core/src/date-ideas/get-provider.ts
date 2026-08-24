// The actual "used automatically when no Anthropic key is configured"
// switch — mirrors ../verification/get-provider.ts / ../moderation/get-provider.ts
// exactly, applied to the date-idea generator.
import { isAnthropicConfigured } from "./config";
import { ClaudeDateIdeaGeneratorProvider } from "./claude-provider";
import { DevMockDateIdeaGeneratorProvider } from "./dev-mock-provider";
import type { DateIdeaGeneratorProvider } from "./types";

/**
 * Returns the real Claude-backed provider when `ANTHROPIC_API_KEY` is set,
 * otherwise the deterministic dev-mock. Callers never branch on
 * `isAnthropicConfigured()` themselves — this is the single place that
 * decision is made, so a page/server-action always gets a working provider
 * with zero credentials.
 */
export function getDateIdeaGeneratorProvider(): DateIdeaGeneratorProvider {
  if (isAnthropicConfigured()) {
    return new ClaudeDateIdeaGeneratorProvider({ apiKey: process.env.ANTHROPIC_API_KEY! });
  }
  return new DevMockDateIdeaGeneratorProvider();
}
