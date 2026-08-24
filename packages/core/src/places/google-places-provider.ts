// ENGINEERING_SPEC.md §1: "Places (meeting-venue picker): Google Places
// API, restricted to venue categories." No live GOOGLE_PLACES_API_KEY
// exists yet (ROADMAP.md → Needs from Sampo) — same caveat as
// ../verification/didit-provider.ts's and ../moderation/omni-moderation-provider.ts's
// top comments: this has never run against Google's actual service,
// best-effort placeholder, treat as provisional.
//
// Uses the Places API (New) `searchText` / place-details-by-id endpoints
// (https://places.googleapis.com/v1). venue-types.ts's isAllowedVenueType
// allow-list filter is applied to every result AFTER the API call returns,
// rather than trusted to a server-side type filter — Places (New)'s Text
// Search only accepts a single `includedType` value, but a real place
// commonly needs only ONE of several allowed types to match
// (venue-types.ts's own comment on multi-type places), so filtering the
// returned `types` array here is both simpler than picking one type to send
// server-side and strictly more correct (it never wrongly excludes a
// restaurant just because the one `includedType` sent was "cafe").
import { isAllowedVenueType } from "./venue-types";
import type { Place, PlacesProvider } from "./types";

export const DEFAULT_GOOGLE_PLACES_API_BASE_URL = "https://places.googleapis.com";

const SEARCH_FIELD_MASK = "places.id,places.displayName,places.formattedAddress,places.types";
const DETAILS_FIELD_MASK = "id,displayName,formattedAddress,types";

export interface GooglePlacesProviderConfig {
  apiKey: string;
  /** Override for tests / self-hosted proxies. Defaults to Google's production API. */
  baseUrl?: string;
}

interface GooglePlaceBody {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  types?: string[];
}

function isGooglePlaceBody(value: unknown): value is GooglePlaceBody {
  return typeof value === "object" && value !== null && typeof (value as Record<string, unknown>).id === "string";
}

function toPlace(body: GooglePlaceBody): Place {
  return {
    placeId: body.id,
    name: body.displayName?.text ?? "",
    address: body.formattedAddress ?? "",
    types: body.types ?? [],
  };
}

export class GooglePlacesProvider implements PlacesProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(config: GooglePlacesProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? DEFAULT_GOOGLE_PLACES_API_BASE_URL;
  }

  async searchVenues(query: string): Promise<Place[]> {
    const response = await fetch(`${this.baseUrl}/v1/places:searchText`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": this.apiKey,
        "X-Goog-FieldMask": SEARCH_FIELD_MASK,
      },
      body: JSON.stringify({ textQuery: query }),
    });

    if (!response.ok) {
      throw new Error(`Google Places text search failed: ${response.status} ${response.statusText}`);
    }

    const body: unknown = await response.json();
    const rawPlaces =
      typeof body === "object" && body !== null && Array.isArray((body as Record<string, unknown>).places)
        ? ((body as Record<string, unknown>).places as unknown[])
        : [];

    // Every result is re-checked against the allow-list here — the actual
    // enforcement point ENGINEERING_SPEC §9 describes ("residential results
    // are excluded by type filter"), not merely a UI nicety.
    return rawPlaces.filter(isGooglePlaceBody).map(toPlace).filter((place) => isAllowedVenueType(place.types));
  }

  async getPlace(placeId: string): Promise<Place | null> {
    const response = await fetch(`${this.baseUrl}/v1/places/${encodeURIComponent(placeId)}`, {
      headers: {
        "X-Goog-Api-Key": this.apiKey,
        "X-Goog-FieldMask": DETAILS_FIELD_MASK,
      },
    });

    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`Google Places details lookup failed: ${response.status} ${response.statusText}`);
    }

    const body: unknown = await response.json();
    if (!isGooglePlaceBody(body)) {
      throw new Error("Google Places details lookup returned an unexpected response shape");
    }
    // Deliberately NOT filtered by isAllowedVenueType here — getPlace's own
    // doc comment (types.ts) says it resolves a place "regardless of type."
    // Callers that need the allow-list check (lib/date-proposals/set-venue.ts)
    // apply isAllowedVenueType themselves against the result.
    return toPlace(body);
  }
}
