// Same PGlite-against-the-real-migration pattern as ./location.test.ts and
// ./clip-views.test.ts. Covers ROADMAP.md M6's candidate-query acceptance
// bullets: "excludes self, active matches, and blockers; includes only
// users within radius_km" (radius itself is @prompt-me/core's job —
// ranking.test.ts/distance.test.ts — this file proves the exclusions this
// query is actually responsible for) and "Unverified users never appear as
// candidates."
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "../schema";
import { ensureUserForClerkId } from "./users";
import { recordVerificationCheck } from "./verification";
import { updateUserGeohash } from "./location";
import { getBaseCandidateUsers, getFeedCandidatesForViewer, getLatestDeniedDecisions } from "./feed";

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../drizzle");

const DAY_MS = 24 * 60 * 60 * 1000;

describe("feed queries", () => {
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

  /** Creates a `passed`-verified, located user in one call — the "otherwise
   * fully eligible" baseline every exclusion test starts from and then
   * breaks exactly one rule of. */
  async function makeVerifiedLocatedUser(clerkId: string, geohash5 = "gcpvj") {
    const user = await ensureUserForClerkId(db, clerkId);
    await recordVerificationCheck(
      db,
      user.id,
      { livenessResult: "pass", ageEstimateResult: "pass", confidence: 0.98 },
      "passed",
    );
    return updateUserGeohash(db, user.id, geohash5);
  }

  describe("getBaseCandidateUsers", () => {
    it("excludes the viewer themself", async () => {
      const viewer = await makeVerifiedLocatedUser("clerk_feed_self");
      const rows = await getBaseCandidateUsers(db, viewer.id);
      expect(rows.some((row) => row.userId === viewer.id)).toBe(false);
    });

    it("excludes an unverified candidate (verification_status != passed)", async () => {
      const viewer = await makeVerifiedLocatedUser("clerk_feed_viewer_for_unverified");
      const unverified = await ensureUserForClerkId(db, "clerk_feed_unverified_candidate");
      await updateUserGeohash(db, unverified.id, "gcpvj"); // located, but never passed verification

      const rows = await getBaseCandidateUsers(db, viewer.id);
      expect(rows.some((row) => row.userId === unverified.id)).toBe(false);
    });

    it("excludes a candidate with no captured location yet", async () => {
      const viewer = await makeVerifiedLocatedUser("clerk_feed_viewer_for_nolocation");
      const noLocation = await ensureUserForClerkId(db, "clerk_feed_nolocation_candidate");
      await recordVerificationCheck(
        db,
        noLocation.id,
        { livenessResult: "pass", ageEstimateResult: "pass", confidence: 0.98 },
        "passed",
      ); // verified, but geohash5 is still null

      const rows = await getBaseCandidateUsers(db, viewer.id);
      expect(rows.some((row) => row.userId === noLocation.id)).toBe(false);
    });

    it("excludes a candidate in an active matches row with the viewer, checked from both directions", async () => {
      const viewer = await makeVerifiedLocatedUser("clerk_feed_active_viewer");
      const matched = await makeVerifiedLocatedUser("clerk_feed_active_matched");
      await db.insert(schema.matches).values({ userAId: viewer.id, userBId: matched.id, status: "active" });

      const fromViewer = await getBaseCandidateUsers(db, viewer.id);
      expect(fromViewer.some((row) => row.userId === matched.id)).toBe(false);

      // The exclusion has to hold symmetrically — the matched user's own
      // feed must not offer the viewer back either.
      const fromMatched = await getBaseCandidateUsers(db, matched.id);
      expect(fromMatched.some((row) => row.userId === viewer.id)).toBe(false);
    });

    it("excludes a candidate who has blocked the viewer (matches.status = blocked)", async () => {
      const viewer = await makeVerifiedLocatedUser("clerk_feed_blocked_viewer");
      const blocker = await makeVerifiedLocatedUser("clerk_feed_blocker");
      // Escape flips an *existing* matched pair's row to "blocked"
      // (SPEC.md §5) — the blocker is user_a here, but the exclusion has to
      // hold regardless of which side of the row initiated it.
      await db.insert(schema.matches).values({ userAId: blocker.id, userBId: viewer.id, status: "blocked" });

      const rows = await getBaseCandidateUsers(db, viewer.id);
      expect(rows.some((row) => row.userId === blocker.id)).toBe(false);
    });

    it("includes a candidate who is verified, located, and shares no matches row with the viewer", async () => {
      const viewer = await makeVerifiedLocatedUser("clerk_feed_eligible_viewer");
      const eligible = await makeVerifiedLocatedUser("clerk_feed_eligible_candidate", "u4pru");

      const rows = await getBaseCandidateUsers(db, viewer.id);
      const row = rows.find((candidate) => candidate.userId === eligible.id);
      expect(row).toBeDefined();
      expect(row!.geohash5).toBe("u4pru");
    });
  });

  describe("getLatestDeniedDecisions", () => {
    it("reduces repeated denials for the same (viewer, profile) pair to the most recent one", async () => {
      const viewer = await makeVerifiedLocatedUser("clerk_feed_denial_viewer");
      const profile = await makeVerifiedLocatedUser("clerk_feed_denial_profile");

      const earlier = new Date(Date.now() - 10 * DAY_MS);
      const later = new Date(Date.now() - 1 * DAY_MS);
      await db.insert(schema.feedDecisions).values({
        viewerId: viewer.id,
        profileUserId: profile.id,
        decision: "denied",
        decidedAt: earlier,
        eligibleAgainAt: new Date(earlier.getTime() + 48 * 60 * 60 * 1000),
      });
      await db.insert(schema.feedDecisions).values({
        viewerId: viewer.id,
        profileUserId: profile.id,
        decision: "denied",
        decidedAt: later,
        eligibleAgainAt: new Date(later.getTime() + 48 * 60 * 60 * 1000),
      });

      const latest = await getLatestDeniedDecisions(db, viewer.id);
      const denial = latest.get(profile.id);
      expect(denial).toBeDefined();
      expect(denial!.decidedAt.getTime()).toBe(later.getTime());
    });

    it("never surfaces a matched decision — that exclusion is the matches table's job", async () => {
      const viewer = await makeVerifiedLocatedUser("clerk_feed_matched_decision_viewer");
      const profile = await makeVerifiedLocatedUser("clerk_feed_matched_decision_profile");
      await db
        .insert(schema.feedDecisions)
        .values({ viewerId: viewer.id, profileUserId: profile.id, decision: "matched" });

      const latest = await getLatestDeniedDecisions(db, viewer.id);
      expect(latest.has(profile.id)).toBe(false);
    });
  });

  describe("getFeedCandidatesForViewer", () => {
    it("attaches the most recent denial to a candidate that has one, and null to one that doesn't", async () => {
      const viewer = await makeVerifiedLocatedUser("clerk_feed_combined_viewer");
      const denied = await makeVerifiedLocatedUser("clerk_feed_combined_denied");
      const clean = await makeVerifiedLocatedUser("clerk_feed_combined_clean", "u4pru");

      const decidedAt = new Date();
      const eligibleAgainAt = new Date(decidedAt.getTime() + 48 * 60 * 60 * 1000);
      await db.insert(schema.feedDecisions).values({
        viewerId: viewer.id,
        profileUserId: denied.id,
        decision: "denied",
        decidedAt,
        eligibleAgainAt,
      });

      const rows = await getFeedCandidatesForViewer(db, viewer.id);
      const deniedRow = rows.find((row) => row.userId === denied.id);
      const cleanRow = rows.find((row) => row.userId === clean.id);

      expect(deniedRow).toBeDefined();
      expect(deniedRow!.latestDenial?.eligibleAgainAt?.getTime()).toBe(eligibleAgainAt.getTime());
      expect(cleanRow).toBeDefined();
      expect(cleanRow!.latestDenial).toBeNull();
    });
  });
});
