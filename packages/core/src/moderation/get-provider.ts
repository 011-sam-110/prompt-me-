// The actual "used automatically when no OpenAI key is configured" switch
// — mirrors ../verification/get-provider.ts exactly, applied to moderation.
import { isOpenAiModerationConfigured } from "./config";
import { DevMockModerationProvider } from "./dev-mock-provider";
import { OpenAiOmniModerationProvider } from "./omni-moderation-provider";
import type { ModerationProvider } from "./types";

/**
 * Returns the real omni-moderation-backed provider when `OPENAI_API_KEY`
 * is set, otherwise the deterministic "always clean" dev-mock. Callers
 * never branch on `isOpenAiModerationConfigured()` themselves — this is
 * the single place that decision is made.
 */
export function getModerationProvider(): ModerationProvider {
  if (isOpenAiModerationConfigured()) {
    return new OpenAiOmniModerationProvider({
      apiKey: process.env.OPENAI_API_KEY!,
      baseUrl: process.env.OPENAI_API_BASE_URL,
    });
  }
  return new DevMockModerationProvider();
}
