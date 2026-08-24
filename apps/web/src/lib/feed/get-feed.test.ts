// Integration coverage for the composed candidate-query + ranking pipeline
// (ROADMAP.md M6): each individual rule already has focused unit coverage
// (packages/db/src/queries/feed.test.ts for the exclusions,
// packages/core/src/feed/ranking.test.ts and .../location/distance.test.ts
// for radius/ranking/48h-resurfacing) — this proves they compose correctly
// through the actual entry point a future /feed UI would call. Same
// PGlite-against-the-real-migration pattern as ../location/capture-location.test.ts.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@prompt-me/db/schema";
import {
  ensureUserForClerkId,
  recordVerificationCheck,
  updateUserGeohash,
  updateUserRadiusKm,
} from "@prompt-me/db";
import { DENIAL_PENALTY_MULTIPLIER, encodeGeohash } from "@prompt-me/core";
import { getRankedFeedForViewer, ViewerLocationNotSetError } from "./get-feed";

const migrationsFolder = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../packages/db/drizzle",
);

const HOUR_MS = 60 * 60 * 1000;

describe("getRankedFeedForViewer", () => {
  let client: PGlite;
  let db: PgliteDatabase<typeof schema>;

  beforeAll(async () => {
    client = new PGlite();
    db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder });
  });

  afterAll(async () => {
    await client.close();
  });

  async function makeVerifiedLocatedUser(clerkId: string, geohash5: string) {
    const user = await ensureUserForClerkId(db, clerkId);
    await recordVerificationCheck(
      db,
      user.id,
      { livenessResult: "pass", ageEstimateResult: "pass", confidence: 0.98 },
      "passed",
    );
    return updateUserGeohash(db, user.id, geohash5);
  }

  it("throws ViewerLocationNotSetError before the viewer has captured a location", async () => {
    const viewer = await ensureUserForClerkId(db, "clerk_getfeed_nolocation");
    await expect(getRankedFeedForViewer(db, viewer.id)).rejects.toBeInstanceOf(
      ViewerLocationNotSetError,
    );
  });

  it("ranks a realistic pool end to end: excludes self/unverified/matched/blocked/out-of-radius/still-denied, penalizes a resurfaced denial", async () => {
    const londonGeohash = encodeGeohash(51.5074, -0.1278, 5);
    const sydneyGeohash = encodeGeohash(-33.8688, 151.2093, 5);

    const viewer = await makeVerifiedLocatedUser("clerk_getfeed_viewer", londonGeohash);
    await updateUserRadiusKm(db, viewer.id, 50);

    const eligible = await makeVerifiedLocatedUser("clerk_getfeed_eligible", londonGeohash);

    const unverified = await ensureUserForClerkId(db, "clerk_getfeed_unverified");
    await updateUserGeohash(db, unverified.id, londonGeohash);

    const outOfRadius = await makeVerifiedLocatedUser("clerk_getfeed_outofradius", sydneyGeohash);

    const matched = await makeVerifiedLocatedUser("clerk_getfeed_matched", londonGeohash);
    await db.insert(schema.matches).values({ userAId: viewer.id, userBId: matched.id, status: "active" });

    const blocker = await makeVerifiedLocatedUser("clerk_getfeed_blocker", londonGeohash);
    await db.insert(schema.matches).values({ userAId: blocker.id, userBId: viewer.id, status: "blocked" });

    const now = new Date("2026-08-24T12:00:00.000Z");

    // Denied 49h ago — past the 48h window, so back in the pool at 0.3x.
    const deniedRecirculated = await makeVerifiedLocatedUser(
      "clerk_getfeed_denied_recirculated",
      londonGeohash,
    );
    const oldDecidedAt = new Date(now.getTime() - 49 * HOUR_MS);
    await db.insert(schema.feedDecisions).values({
      viewerId: viewer.id,
      profileUserId: deniedRecirculated.id,
      decision: "denied",
      decidedAt: oldDecidedAt,
      eligibleAgainAt: new Date(oldDecidedAt.getTime() + 48 * HOUR_MS),
    });

    // Denied 1h ago — still inside the 48h window, so excluded entirely.
    const deniedStillExcluded = await makeVerifiedLocatedUser(
      "clerk_getfeed_denied_still_excluded",
      londonGeohash,
    );
    const recentDecidedAt = new Date(now.getTime() - 1 * HOUR_MS);
    await db.insert(schema.feedDecisions).values({
      viewerId: viewer.id,
      profileUserId: deniedStillExcluded.id,
      decision: "denied",
      decidedAt: recentDecidedAt,
      eligibleAgainAt: new Date(recentDecidedAt.getTime() + 48 * HOUR_MS),
    });

    const ranked = await getRankedFeedForViewer(db, viewer.id, now, () => 0.5); // fixed => zero jitter
    const rankedIds = ranked.map((row) => row.userId);

    expect(rankedIds).not.toContain(viewer.id);
    expect(rankedIds).not.toContain(unverified.id);
    expect(rankedIds).not.toContain(outOfRadius.id);
    expect(rankedIds).not.toContain(matched.id);
    expect(rankedIds).not.toContain(blocker.id);
    expect(rankedIds).not.toContain(deniedStillExcluded.id);

    expect(rankedIds).toContain(eligible.id);
    expect(rankedIds).toContain(deniedRecirculated.id);

    const eligibleScore = ranked.find((row) => row.userId === eligible.id)!.score;
    const recirculatedScore = ranked.find((row) => row.userId === deniedRecirculated.id)!.score;
    expect(recirculatedScore).toBeCloseTo(eligibleScore * DENIAL_PENALTY_MULTIPLIER, 6);
  });
});
