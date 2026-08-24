// Thin pass-through to the active places provider (dev-mock or real Google
// Places, per @prompt-me/core's getPlacesProvider) — kept as its own
// composition-point file, mirroring every other adapter call in this
// codebase, so the venue picker's server action (actions.ts's
// submitSearchVenues) has exactly one place to import from.
//
// No participant/match guard here: searching venues by name reveals
// nothing about any match or user, only Google's (or the dev-mock's) own
// public place data — the same reasoning lib/location's radius controls
// need no per-match guard either.
import { getPlacesProvider, type Place } from "@prompt-me/core";

export async function searchVenues(query: string): Promise<Place[]> {
  return getPlacesProvider().searchVenues(query);
}
