// Whether a real OpenAI API key is configured. Mirrors
// ../transcription/config.ts's isOpenAiTranscriptionConfigured() exactly —
// see that file's comment for why moderation gets its own tiny check
// rather than sharing a helper, despite both reading the same env var.
export function isOpenAiModerationConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}
