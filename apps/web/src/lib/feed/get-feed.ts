// The composition point ROADMAP.md M6's candidate-query/ranking half
// actually runs: looks up the viewer's own fuzzed location + radius
// (@prompt-me/db), fetches the otherwise-eligible candidate pool
// (@prompt-me/db's getFeedCandidatesForViewer), and ranks it
// (@prompt-me/core's rankFeedCandidates) — mirroring how
// lib/verification/run-check.ts and lib/location/capture-location.ts each
// compose @prompt-me/core + @prompt-me/db for their own milestone.
//
// `now`/`randomFn` are threaded straight through to @prompt-me/core rather
// than defaulted here, so a caller (a Server Component today, a test
// always) controls both without either being read from ambient global
// state anywhere in this call chain.
import { rankFeedCandidates, type RankedFeedCandidate } from "@prompt-me/core";
import { getFeedCandidatesForViewer, getUserById, type AnyDb } from "@prompt-me/db";

/**
 * Thrown when the viewer hasn't captured a location yet — there is no
 * radius to rank against. Distinct from a generic Error so a caller (the
 * eventual /feed UI) can route back to the location-capture prompt rather
 * than treating this as an unexpected failure.
 */
export class ViewerLocationNotSetError extends Error {
  constructor(userId: string) {
    super(`getRankedFeedForViewer: users.geohash5 is not set for userId=${userId}`);
    this.name = "ViewerLocationNotSetError";
  }
}

export async function getRankedFeedForViewer(
  db: AnyDb,
  viewerId: string,
  now: Date = new Date(),
  randomFn: () => number = Math.random,
): Promise<RankedFeedCandidate[]> {
  const viewer = await getUserById(db, viewerId);
  if (!viewer) {
    throw new Error(`getRankedFeedForViewer: no users row found for userId=${viewerId}`);
  }
  if (viewer.geohash5 === null) {
    throw new ViewerLocationNotSetError(viewerId);
  }

  const candidates = await getFeedCandidatesForViewer(db, viewerId);
  return rankFeedCandidates(candidates, viewer.geohash5, viewer.radiusKm, now, randomFn);
}
