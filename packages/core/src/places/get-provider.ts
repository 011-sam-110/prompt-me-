// The actual "used automatically when no Google Places key is configured"
// switch — mirrors ../verification/get-provider.ts / ../moderation/get-provider.ts
// exactly, applied to places. ROADMAP.md M9: "use a dev-mock place list if
// no Google Places API key is present."
import { isGooglePlacesConfigured } from "./config";
import { DevMockPlacesProvider } from "./dev-mock-provider";
import { GooglePlacesProvider } from "./google-places-provider";
import type { PlacesProvider } from "./types";

/**
 * Returns the real Google Places-backed provider when
 * `GOOGLE_PLACES_API_KEY` is set, otherwise the deterministic dev-mock.
 * Callers never branch on `isGooglePlacesConfigured()` themselves — this is
 * the single place that decision is made.
 */
export function getPlacesProvider(): PlacesProvider {
  if (isGooglePlacesConfigured()) {
    return new GooglePlacesProvider({
      apiKey: process.env.GOOGLE_PLACES_API_KEY!,
      baseUrl: process.env.GOOGLE_PLACES_API_BASE_URL,
    });
  }
  return new DevMockPlacesProvider();
}
