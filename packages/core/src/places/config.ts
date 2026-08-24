// Whether a real Google Places API key is configured. Mirrors
// ../moderation/config.ts's isOpenAiModerationConfigured() /
// ../verification/config.ts's isDiditConfigured() exactly.
export function isGooglePlacesConfigured(): boolean {
  return Boolean(process.env.GOOGLE_PLACES_API_KEY);
}
