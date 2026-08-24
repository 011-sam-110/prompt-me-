// ROADMAP.md M9: "use a dev-mock place list if no Google Places API key is
// present." Used automatically (get-provider.ts) whenever no real
// GOOGLE_PLACES_API_KEY is configured, which is the case for the whole repo
// today (ROADMAP.md → Needs from Sampo).
import { isAllowedVenueType } from "./venue-types";
import type { Place, PlacesProvider } from "./types";

interface MockVenueFixture {
  placeId: string;
  name: string;
  address: string;
  types: string[];
}

/**
 * Six fixed, realistic venues spanning most of venue-types.ts's allow-list
 * (a cafe, a bar, a museum, a park, a restaurant, a bakery) — enough
 * variety for a real UI walkthrough and for search-by-name to have
 * something to filter. Every one of them is a public-venue type by
 * construction; `searchVenues` never has to filter anything out of this
 * particular list, only DEV_MOCK_DISALLOWED_PLACE below is excluded.
 */
const DEV_MOCK_VENUES: MockVenueFixture[] = [
  {
    placeId: "dev-mock-place-corner-cafe",
    name: "The Corner Café",
    address: "12 Church Street",
    types: ["cafe", "food", "point_of_interest", "establishment"],
  },
  {
    placeId: "dev-mock-place-riverside-museum",
    name: "Riverside Museum",
    address: "4 Quayside Walk",
    types: ["museum", "tourist_attraction", "point_of_interest", "establishment"],
  },
  {
    placeId: "dev-mock-place-botanic-gardens",
    name: "Botanic Gardens Park",
    address: "Gardens Lane",
    types: ["park", "tourist_attraction", "point_of_interest", "establishment"],
  },
  {
    placeId: "dev-mock-place-anchor-bar",
    name: "The Anchor Bar",
    address: "8 Harbour Road",
    types: ["bar", "restaurant", "food", "point_of_interest", "establishment"],
  },
  {
    placeId: "dev-mock-place-old-town-bakery",
    name: "Old Town Bakery",
    address: "21 Market Square",
    types: ["bakery", "cafe", "food", "point_of_interest", "establishment"],
  },
  {
    placeId: "dev-mock-place-skyline-restaurant",
    name: "Skyline Rooftop Restaurant",
    address: "1 High Street",
    types: ["restaurant", "food", "point_of_interest", "establishment"],
  },
];

/**
 * A place that exists (as far as `getPlace` is concerned) but carries no
 * public-venue type — a hotel, standing in for "a residential-ish /
 * non-public location that has its own real Google Places id." Reachable
 * ONLY via `getPlace`, never via `searchVenues` (the picker's own search
 * surface) — modeling exactly the bypass attempt ROADMAP.md M9 asks to be
 * closed: someone who somehow obtains a disallowed place_id (inspecting
 * network traffic, copying one from elsewhere) and submits it straight to
 * the accept/set-venue server action, skipping the picker UI entirely.
 * lib/date-proposals/set-venue.ts re-validates every venuePlaceId through
 * `getPlace` + `isAllowedVenueType` for exactly this reason — see
 * google-places-provider.test.ts / set-venue.test.ts for the same guard
 * proven against the real-provider shape and the composition layer.
 */
const DEV_MOCK_DISALLOWED_PLACE: MockVenueFixture = {
  placeId: "dev-mock-place-disallowed-lodging",
  name: "The Grand Lodge Hotel",
  address: "1 Station Road",
  types: ["lodging", "point_of_interest", "establishment"],
};

function toPlace(fixture: MockVenueFixture): Place {
  return { placeId: fixture.placeId, name: fixture.name, address: fixture.address, types: fixture.types };
}

export class DevMockPlacesProvider implements PlacesProvider {
  async searchVenues(query: string): Promise<Place[]> {
    const needle = query.trim().toLowerCase();
    const matches = needle === "" ? DEV_MOCK_VENUES : DEV_MOCK_VENUES.filter((v) => v.name.toLowerCase().includes(needle));
    // Every DEV_MOCK_VENUES entry is already an allowed type by
    // construction, but filtering here anyway (rather than trusting the
    // fixture list) is what makes this method's own behavior — not just
    // its data — the thing under test in dev-mock-provider.test.ts, and
    // matches google-places-provider.ts's real implementation applying the
    // same filter to a live API response.
    return matches.map(toPlace).filter((place) => isAllowedVenueType(place.types));
  }

  async getPlace(placeId: string): Promise<Place | null> {
    const all = [...DEV_MOCK_VENUES, DEV_MOCK_DISALLOWED_PLACE];
    const found = all.find((v) => v.placeId === placeId);
    return found ? toPlace(found) : null;
  }
}
