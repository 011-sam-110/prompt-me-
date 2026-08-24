// ENGINEERING_SPEC.md §9 / SPEC.md §9: "Meeting places are restricted to
// public venues; a residential address cannot be set as a meeting place."
// §9 names the mechanism directly: "the meeting-place picker queries
// Google Places restricted to venue types that are inherently public
// (`restaurant`, `cafe`, `bar`, `museum`, `park`, `tourist_attraction`,
// etc.) — residential results are excluded by type filter."
//
// This is a POSITIVE allow-list against Google Places' own `types`
// taxonomy — simpler and safer than trying to enumerate every type a
// residence, hotel room, or other non-public location might carry (Google
// alone has dozens: `lodging`, `premise`, `street_address`, `subpremise`,
// ...). A place is allowed the instant ANY of its own types matches; a
// place with NO overlap is rejected outright.
export const ALLOWED_VENUE_TYPES: ReadonlySet<string> = new Set([
  // Named explicitly in ENGINEERING_SPEC §9:
  "restaurant",
  "cafe",
  "bar",
  "museum",
  "park",
  "tourist_attraction",
  // Same "inherently public venue" spirit as the ones above — a
  // reasonable engineering extension of the "etc." ENGINEERING_SPEC §9
  // leaves open, not literal spec text:
  "bakery",
  "night_club",
  "art_gallery",
  "zoo",
  "aquarium",
  "amusement_park",
  "bowling_alley",
  "movie_theater",
  "library",
  "shopping_mall",
  "stadium",
]);

/**
 * True if at least one of the place's own `types` is a public-venue type
 * above. A place commonly carries several types at once (e.g.
 * `["restaurant", "food", "point_of_interest", "establishment"]`) — this
 * only needs one to match. A place carrying none of them — Google's own
 * `lodging`, `premise`, `street_address`, etc. — is rejected, which is
 * exactly what keeps a residential address (or a hotel room) out of the
 * picker.
 */
export function isAllowedVenueType(types: readonly string[]): boolean {
  return types.some((type) => ALLOWED_VENUE_TYPES.has(type));
}
