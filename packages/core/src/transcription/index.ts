// Barrel for @prompt-me/core's transcription adapter (ENGINEERING_SPEC.md
// §1/§4, ROADMAP.md M4).
export type { TranscriptionInput, TranscriptionOutput, TranscriptionProvider } from "./types";
export { isOpenAiTranscriptionConfigured } from "./config";
export { DevMockTranscriptionProvider, DEV_MOCK_TRANSCRIPT_TEXT } from "./dev-mock-provider";
export {
  OpenAiWhisperTranscriptionProvider,
  DEFAULT_OPENAI_API_BASE_URL,
  WHISPER_MODEL,
  type OpenAiWhisperTranscriptionProviderConfig,
} from "./whisper-provider";
export { getTranscriptionProvider } from "./get-provider";
