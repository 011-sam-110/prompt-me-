// ENGINEERING_SPEC.md §1/§9: "Places (meeting-venue picker): Google Places
// API, restricted to venue categories." Same adapter shape as every other
// external integration in this package (verification, moderation,
// transcription, storage) — a provider interface with a deterministic
// dev-mock (dev-mock-provider.ts) and a real implementation
// (google-places-provider.ts), selected by get-provider.ts based on
// config.ts's isGooglePlacesConfigured().
export interface Place {
  placeId: string;
  name: string;
  address: string;
  /** Google Places' own `types` taxonomy for this place — the field
   * venue-types.ts's isAllowedVenueType filters on. */
  types: string[];
}

export interface PlacesProvider {
  /**
   * Text search restricted to public-venue results (venue-types.ts's
   * ALLOWED_VENUE_TYPES) — the ONLY way the meeting-place picker UI ever
   * surfaces a place (components/date-proposals/venue-picker.tsx has no
   * free-text address field at all; every result it renders already came
   * from this method, never from user-typed text turned directly into an
   * address).
   */
  searchVenues(query: string): Promise<Place[]>;

  /**
   * Looks up one place by id, regardless of type. Used only for
   * server-side re-validation at accept-time
   * (apps/web's lib/date-proposals/set-venue.ts), never by the picker UI
   * itself. Defense in depth: even though the picker only ever emits an
   * allowed place_id, a `venuePlaceId` submitted straight to the server
   * action (bypassing the picker) is re-validated against this lookup's
   * own `types` before being accepted — so there is no path, UI or direct
   * server-action call, through which a residential address can end up as
   * a locked meeting place. Returns null when the id doesn't exist.
   */
  getPlace(placeId: string): Promise<Place | null>;
}
