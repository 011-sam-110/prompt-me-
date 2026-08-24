// The actual "used automatically when no OpenAI key is configured" switch
// — mirrors verification/get-provider.ts exactly, applied to transcription.
import { isOpenAiTranscriptionConfigured } from "./config";
import { DevMockTranscriptionProvider } from "./dev-mock-provider";
import { OpenAiWhisperTranscriptionProvider } from "./whisper-provider";
import type { TranscriptionProvider } from "./types";

/**
 * Returns the real Whisper-backed provider when `OPENAI_API_KEY` is set,
 * otherwise the deterministic dev-mock. Callers never branch on
 * `isOpenAiTranscriptionConfigured()` themselves — this is the single
 * place that decision is made.
 */
export function getTranscriptionProvider(): TranscriptionProvider {
  if (isOpenAiTranscriptionConfigured()) {
    return new OpenAiWhisperTranscriptionProvider({
      apiKey: process.env.OPENAI_API_KEY!,
      baseUrl: process.env.OPENAI_API_BASE_URL,
    });
  }
  return new DevMockTranscriptionProvider();
}
