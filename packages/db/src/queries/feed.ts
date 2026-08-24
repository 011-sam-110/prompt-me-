// feed candidate query — ENGINEERING_SPEC.md §6, ROADMAP.md M6. Mechanical
// data access only, same split as clips.ts/clip-views.ts: the actual
// ranking (freshness/jitter/denial-penalty) and radius math are
// @prompt-me/core's feed/ranking.ts + location/distance.ts, composed with
// these queries by apps/web/src/lib/feed/get-feed.ts (mirrors
// run-check.ts's/capture-location.ts's composition shape).
//
// Split into two queries rather than one big join:
//  - getBaseCandidateUsers applies every *exclusion* the candidate query
//    needs that's expressible as a plain WHERE clause and doesn't depend
//    on "now" — self, unverified, no-geohash-yet, and anyone sharing *any*
//    matches row with the viewer.
//  - getLatestDeniedDecisions separately fetches the viewer's own denial
//    history, reduced in JS to the single most recent `denied` row per
//    profile (feed_decisions is append-only — schema/feed-decisions.ts's
//    own comment — so an older denial is superseded by a newer one for the
//    same pair).
// getFeedCandidatesForViewer combines them. Neither query filters on time
// or radius itself — those are ENGINEERING_SPEC §6 rules that depend on
// "now" (the 48h resurfacing clock) or on decoding a geohash back to a
// coordinate, both of which are @prompt-me/core's job per ENGINEERING_SPEC
// §1 ("packages/core... feed-ranking logic"), not this file's — keeping
// every time/geometry-dependent decision out of SQL is also what makes
// those rules testable with a mocked clock and plain JS fixtures, no
// database involved.
import { and, asc, eq, isNotNull, ne, notExists, or } from "drizzle-orm";
import { matches } from "../schema/matches";
import { feedDecisions, type FeedDecision } from "../schema/feed-decisions";
import { users } from "../schema/users";
import type { AnyDb } from "../types";

export interface CandidateUserRow {
  userId: string;
  geohash5: string;
  createdAt: Date;
}

/**
 * The otherwise-eligible candidate pool for `viewerId`, before radius/time
 * filtering: excludes self, any user whose `verification_status` isn't
 * `passed` (ROADMAP M3's stub, `isEligibleFeedCandidate`, made real here —
 * "a user with verification_status != passed cannot appear in another
 * user's feed"), any user with no captured location yet (nothing to
 * radius-match against), and anyone sharing *any* `matches` row with the
 * viewer regardless of `status`.
 *
 * ENGINEERING_SPEC §6 names "an active matches row" and "anyone who has
 * blocked the viewer via Escape" as two separate exclusions, but both live
 * in the same table: an active match hard-excludes permanently, and Escape
 * (SPEC.md §5, ROADMAP M7) never creates a standalone "block" row — it
 * flips an *existing* matched pair's row to `status = "blocked"` (SPEC.md
 * §5: "Escape... available any time from DatesInPlanning onward", i.e. only
 * once a `matches` row already exists between the pair). So "any matches
 * row with this pair, either status" is the one check that correctly
 * implements both named exclusions without this query needing to guess
 * which direction blocked which.
 */
export async function getBaseCandidateUsers(db: AnyDb, viewerId: string): Promise<CandidateUserRow[]> {
  const rows = await db
    .select({ userId: users.id, geohash5: users.geohash5, createdAt: users.createdAt })
    .from(users)
    .where(
      and(
        ne(users.id, viewerId),
        eq(users.verificationStatus, "passed"),
        isNotNull(users.geohash5),
        notExists(
          db
            .select({ id: matches.id })
            .from(matches)
            .where(
              or(
                and(eq(matches.userAId, viewerId), eq(matches.userBId, users.id)),
                and(eq(matches.userAId, users.id), eq(matches.userBId, viewerId)),
              ),
            ),
        ),
      ),
    );

  // geohash5 is proven NOT NULL by the isNotNull filter above; the column's
  // Drizzle type stays nullable (schema/users.ts — it's genuinely nullable
  // at rest for a not-yet-located user), so this narrows it once here
  // rather than leaking `string | null` to every caller downstream.
  return rows.map((row) => ({ ...row, geohash5: row.geohash5 as string }));
}

/**
 * The viewer's own denial history against every profile they've ever been
 * shown, reduced to one row per `profileUserId` — the most recent `denied`
 * decision, since a pair can be denied more than once over time
 * (schema/feed-decisions.ts). `matched` rows are never fetched here: once a
 * match exists, `getBaseCandidateUsers`'s `matches`-table check already
 * removes that profile from the pool, so a `matched` feed_decisions row has
 * nothing left to gate.
 */
export async function getLatestDeniedDecisions(
  db: AnyDb,
  viewerId: string,
): Promise<Map<string, FeedDecision>> {
  const rows = await db
    .select()
    .from(feedDecisions)
    .where(and(eq(feedDecisions.viewerId, viewerId), eq(feedDecisions.decision, "denied")))
    .orderBy(asc(feedDecisions.decidedAt));

  const latestByProfile = new Map<string, FeedDecision>();
  for (const row of rows) {
    // Ascending order means each later row for the same profile overwrites
    // the previous one in the map, leaving the most recent denial standing.
    latestByProfile.set(row.profileUserId, row);
  }
  return latestByProfile;
}

export interface FeedCandidateRow {
  userId: string;
  geohash5: string;
  createdAt: Date;
  latestDenial: { eligibleAgainAt: Date | null; decidedAt: Date } | null;
}

/**
 * The full otherwise-eligible candidate pool for `viewerId`, each row
 * carrying its most recent denial (if any) — everything
 * @prompt-me/core's `rankFeedCandidates` needs to apply the radius filter
 * and the 48h-exclusion/0.3x-penalty rule against a given `now`. Still not
 * radius- or time-filtered itself (see this file's header comment).
 */
export async function getFeedCandidatesForViewer(
  db: AnyDb,
  viewerId: string,
): Promise<FeedCandidateRow[]> {
  const [baseCandidates, latestDenials] = await Promise.all([
    getBaseCandidateUsers(db, viewerId),
    getLatestDeniedDecisions(db, viewerId),
  ]);

  return baseCandidates.map((candidate) => {
    const denial = latestDenials.get(candidate.userId);
    return {
      ...candidate,
      latestDenial: denial
        ? { eligibleAgainAt: denial.eligibleAgainAt, decidedAt: denial.decidedAt }
        : null,
    };
  });
}
