// ENGINEERING_SPEC.md §10: "single Claude call with both transcript sets +
// the match's shared geohash cell." Two matched users don't necessarily
// carry the identical `geohash5` string — §6's candidate query matches on
// "falls within the viewer's radius_km" (a distance check against each
// cell's decoded center), not on geohash equality — so a match's "shared"
// cell needs its own small, documented rule the way every other engineering
// default in this codebase gets one (e.g. schema/users.ts's default
// radius_km, schema/matches.ts's canonical pair ordering):
//
//  - both users' cells unknown -> no shared cell (null); the generator call
//    (date-ideas/claude-provider.ts) just runs without location context.
//  - one user's cell unknown -> use the other's directly; there's nothing
//    to average against.
//  - both known and identical -> that exact cell; there's nothing to
//    compute.
//  - both known and different -> average the two cells' decoded centers
//    (plain lat/lon mean — at ~4.9km-per-side cells this is an
//    engineering-fine approximation of a real midpoint, the same
//    proportionate-precision judgment fuzz-location.ts's own comment makes
//    about geohash-length granularity) and re-encode that point back to a
//    length-5 geohash: literally "the cell containing the point between
//    them," which is the most direct reading of "shared" available from
//    two cells that are not the same cell.
import { decodeGeohashCenter, encodeGeohash } from "./geohash";
import { LOCATION_GEOHASH_LENGTH } from "./fuzz-location";

export function sharedGeohashCell(geohashA: string | null, geohashB: string | null): string | null {
  if (geohashA === null && geohashB === null) return null;
  if (geohashA === null) return geohashB;
  if (geohashB === null) return geohashA;
  if (geohashA === geohashB) return geohashA;

  const centerA = decodeGeohashCenter(geohashA);
  const centerB = decodeGeohashCenter(geohashB);
  return encodeGeohash(
    (centerA.latitude + centerB.latitude) / 2,
    (centerA.longitude + centerB.longitude) / 2,
    LOCATION_GEOHASH_LENGTH,
  );
}
