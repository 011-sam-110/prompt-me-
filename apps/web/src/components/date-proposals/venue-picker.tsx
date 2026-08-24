"use client";
// SPEC.md §6 / ENGINEERING_SPEC.md §9's meeting-place picker. ROADMAP.md M9:
// "NO free-text address field that could bypass it." This component has no
// address input anywhere — the only way a venue reaches the server is a
// `placeId` that came straight back from `submitSearchVenues` (dev-mock or
// real Google Places, both already restricted to public-venue types via
// @prompt-me/core's isAllowedVenueType), attached to a "Choose this venue"
// button click. lib/date-proposals/set-venue.ts re-validates that id
// server-side regardless, so this is defense in depth, not the only guard.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Place } from "@prompt-me/core";
import { Button } from "@/components/ui/button";
import { submitSearchVenues, submitSetDateVenue } from "@/lib/date-proposals/actions";

export function VenuePicker({ proposalId }: { proposalId: string }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [choosingId, setChoosingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function search(nextQuery: string) {
    setIsSearching(true);
    setError(null);
    submitSearchVenues(nextQuery)
      .then(setResults)
      .catch(() => setError("Couldn't search venues. Please try again."))
      .finally(() => setIsSearching(false));
  }

  // A starting list to browse before anyone types anything — the dev-mock
  // (or a real Google Places text search with an empty query) both treat
  // "" as "browse everything allowed."
  // Deliberately empty deps — this is a mount-only initial load.
  useEffect(() => {
    search("");
  }, []);

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    search(query);
  }

  function choose(placeId: string) {
    setError(null);
    setChoosingId(placeId);
    submitSetDateVenue(proposalId, placeId)
      .then(() => {
        router.refresh();
      })
      .catch(() => {
        setError("Couldn't set that venue — try a different one.");
      })
      .finally(() => {
        setChoosingId(null);
      });
  }

  return (
    <div className="flex flex-col gap-2" data-testid="venue-picker">
      <form onSubmit={submitSearch} className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search public venues (e.g. café, museum, park)"
          aria-label="Search public venues"
          className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
        />
        <Button type="submit" size="sm" variant="outline" disabled={isSearching}>
          Search
        </Button>
      </form>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {isSearching ? (
        <p className="text-xs text-muted-foreground">Searching...</p>
      ) : results.length === 0 ? (
        <p className="text-xs text-muted-foreground">No public venues found for that search.</p>
      ) : (
        <ul className="flex flex-col gap-1.5" data-testid="venue-picker-results">
          {results.map((place) => (
            <li
              key={place.placeId}
              data-place-id={place.placeId}
              className="flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1.5 text-sm"
            >
              <div>
                <p className="font-medium">{place.name}</p>
                <p className="text-xs text-muted-foreground">{place.address}</p>
              </div>
              <Button size="sm" disabled={choosingId !== null} onClick={() => choose(place.placeId)}>
                {choosingId === place.placeId ? "Choosing..." : "Choose this venue"}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
