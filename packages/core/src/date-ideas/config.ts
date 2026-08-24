// Whether a real Anthropic API key is configured. Mirrors
// ../verification/config.ts's isDiditConfigured() / ../moderation/config.ts's
// isOpenAiModerationConfigured() exactly, applied to Anthropic —
// ENGINEERING_SPEC.md §10 / ROADMAP.md M10: "behind an adapter with a
// dev-mock fallback." No live ANTHROPIC_API_KEY exists yet in this repo
// (.env.example's own comment, ROADMAP.md -> Needs from Sampo), so the
// dev-mock is what every environment actually exercises today.
export function isAnthropicConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}
