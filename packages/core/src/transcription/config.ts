// Whether a real OpenAI API key is configured. Mirrors
// verification/config.ts's isDiditConfigured() exactly, applied to OpenAI.
//
// ENGINEERING_SPEC §1 lists a single "OpenAI API key" need shared by both
// Whisper (this module) and moderation (../moderation/config.ts) — each
// still gets its own tiny isConfigured() check (matching the
// one-file-per-adapter convention this package already uses everywhere
// else) rather than a shared cross-cutting helper, but both intentionally
// read the exact same env var, so ROADMAP.md's "Needs from Sampo" only
// ever needs to list it once.
export function isOpenAiTranscriptionConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}
