// ROADMAP.md M7 acceptance: "Mutual full-completion (both directions)
// creates a matches row and removes both users from each other's future
// candidate queries." / "One-directional completion does not create a
// match." Same PGlite-against-the-real-migration pattern as
// lib/clips/report-view-position.test.ts.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@prompt-me/db/schema";
import {
  ensurePromptsSeeded,
  ensureUserForClerkId,
  getBaseCandidateUsers,
  insertClip,
  recordClipViewPosition,
  recordVerificationCheck,
  updateUserGeohash,
} from "@prompt-me/db";
import { checkAndCreateMatchIfMutual } from "./check-and-create-match";

const migrationsFolder = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../packages/db/drizzle",
);

describe("checkAndCreateMatchIfMutual", () => {
  let client: PGlite;
  let db: PgliteDatabase<typeof schema>;

  beforeAll(async () => {
    client = new PGlite();
    db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder });
    await ensurePromptsSeeded(db);
  });

  afterAll(async () => {
    await client.close();
  });

  /** Same helper shape as packages/db/src/queries/feed.test.ts's — a
   * `passed`-verified, located user, needed for the M6-integration test
   * below (getBaseCandidateUsers requires both). */
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

  async function matchRowsForPair(userIdA: string, userIdB: string) {
    const rows = await db.select().from(schema.matches);
    return rows.filter(
      (row) =>
        (row.userAId === userIdA && row.userBId === userIdB) ||
        (row.userAId === userIdB && row.userBId === userIdA),
    );
  }

  it("one-directional completion does not create a match", async () => {
    const viewer = await ensureUserForClerkId(db, "clerk_ccm_onedir_viewer");
    const owner = await ensureUserForClerkId(db, "clerk_ccm_onedir_owner");
    const ownerClip = await insertClip(db, {
      userId: owner.id,
      tier: 1,
      durationSeconds: 15,
      storageUrl: "dev-blob://ccm/onedir-owner.wav",
      customPromptText: "x",
    });
    // Owner has a clip of the viewer's to (never) watch — its existence
    // matters: it proves the absence of a match isn't just "the owner has
    // nothing to complete", it's genuinely one-directional.
    await insertClip(db, {
      userId: viewer.id,
      tier: 1,
      durationSeconds: 15,
      storageUrl: "dev-blob://ccm/onedir-viewer.wav",
      customPromptText: "y",
    });

    const clipView = await recordClipViewPosition(db, {
      viewerId: viewer.id,
      profileUserId: owner.id,
      clipId: ownerClip.id,
      reachedEnd: true,
    });

    const match = await checkAndCreateMatchIfMutual(db, clipView);

    expect(match).toBeNull();
    expect(await matchRowsForPair(viewer.id, owner.id)).toHaveLength(0);
  });

  it("mutual completion in both directions creates exactly one matches row, on the write that closes the loop", async () => {
    const userA = await ensureUserForClerkId(db, "clerk_ccm_mutual_a");
    const userB = await ensureUserForClerkId(db, "clerk_ccm_mutual_b");
    const clipA = await insertClip(db, {
      userId: userA.id,
      tier: 1,
      durationSeconds: 15,
      storageUrl: "dev-blob://ccm/mutual-a.wav",
      customPromptText: "x",
    });
    const clipB = await insertClip(db, {
      userId: userB.id,
      tier: 1,
      durationSeconds: 15,
      storageUrl: "dev-blob://ccm/mutual-b.wav",
      customPromptText: "y",
    });

    // B watches A's clip fully first — still only one direction.
    const bViewsA = await recordClipViewPosition(db, {
      viewerId: userB.id,
      profileUserId: userA.id,
      clipId: clipA.id,
      reachedEnd: true,
    });
    expect(await checkAndCreateMatchIfMutual(db, bViewsA)).toBeNull();
    expect(await matchRowsForPair(userA.id, userB.id)).toHaveLength(0);

    // A now watches B's clip fully — this write is the one that completes
    // both directions.
    const aViewsB = await recordClipViewPosition(db, {
      viewerId: userA.id,
      profileUserId: userB.id,
      clipId: clipB.id,
      reachedEnd: true,
    });
    const match = await checkAndCreateMatchIfMutual(db, aViewsB);

    expect(match).not.toBeNull();
    expect(match!.status).toBe("active");
    // Canonical order (@prompt-me/core's canonicalizeMatchPair): whichever
    // id sorts first is always userAId, regardless of who completed last.
    const [expectedA, expectedB] = [userA.id, userB.id].sort();
    expect(match!.userAId).toBe(expectedA);
    expect(match!.userBId).toBe(expectedB);
    expect(await matchRowsForPair(userA.id, userB.id)).toHaveLength(1);
  });

  it("is idempotent — re-running after a match already exists never creates a duplicate row", async () => {
    const userA = await ensureUserForClerkId(db, "clerk_ccm_idempotent_a");
    const userB = await ensureUserForClerkId(db, "clerk_ccm_idempotent_b");
    const clipA = await insertClip(db, {
      userId: userA.id,
      tier: 1,
      durationSeconds: 15,
      storageUrl: "dev-blob://ccm/idempotent-a.wav",
      customPromptText: "x",
    });
    const clipB = await insertClip(db, {
      userId: userB.id,
      tier: 1,
      durationSeconds: 15,
      storageUrl: "dev-blob://ccm/idempotent-b.wav",
      customPromptText: "y",
    });
    await recordClipViewPosition(db, {
      viewerId: userB.id,
      profileUserId: userA.id,
      clipId: clipA.id,
      reachedEnd: true,
    });
    const aViewsB = await recordClipViewPosition(db, {
      viewerId: userA.id,
      profileUserId: userB.id,
      clipId: clipB.id,
      reachedEnd: true,
    });
    const first = await checkAndCreateMatchIfMutual(db, aViewsB);

    // A later re-report of the same already-complete view (e.g. the player
    // firing another `timeupdate` after `ended`) re-triggers this function
    // exactly as production does on every write.
    const second = await checkAndCreateMatchIfMutual(db, aViewsB);

    expect(second!.id).toBe(first!.id);
    expect(await matchRowsForPair(userA.id, userB.id)).toHaveLength(1);
  });

  it("never creates a self-match if a viewer somehow reports a position against their own profile", async () => {
    const user = await ensureUserForClerkId(db, "clerk_ccm_self");
    const ownClip = await insertClip(db, {
      userId: user.id,
      tier: 1,
      durationSeconds: 15,
      storageUrl: "dev-blob://ccm/self.wav",
      customPromptText: "x",
    });
    const clipView = await recordClipViewPosition(db, {
      viewerId: user.id,
      profileUserId: user.id,
      clipId: ownClip.id,
      reachedEnd: true,
    });

    await expect(checkAndCreateMatchIfMutual(db, clipView)).resolves.toBeNull();
    expect(await matchRowsForPair(user.id, user.id)).toHaveLength(0);
  });

  it("a write that doesn't reach the clip's end never creates a match, even with the reverse direction already complete", async () => {
    const userA = await ensureUserForClerkId(db, "clerk_ccm_shortfall_a");
    const userB = await ensureUserForClerkId(db, "clerk_ccm_shortfall_b");
    const clipA = await insertClip(db, {
      userId: userA.id,
      tier: 1,
      durationSeconds: 15,
      storageUrl: "dev-blob://ccm/shortfall-a.wav",
      customPromptText: "x",
    });
    const clipB = await insertClip(db, {
      userId: userB.id,
      tier: 1,
      durationSeconds: 15,
      storageUrl: "dev-blob://ccm/shortfall-b.wav",
      customPromptText: "y",
    });
    await recordClipViewPosition(db, {
      viewerId: userB.id,
      profileUserId: userA.id,
      clipId: clipA.id,
      reachedEnd: true,
    });

    const shortReport = await recordClipViewPosition(db, {
      viewerId: userA.id,
      profileUserId: userB.id,
      clipId: clipB.id,
      reachedEnd: false,
    });

    expect(await checkAndCreateMatchIfMutual(db, shortReport)).toBeNull();
    expect(await matchRowsForPair(userA.id, userB.id)).toHaveLength(0);
  });

  it("M6 integration: once a match forms, each user is immediately excluded from the other's candidate pool", async () => {
    const userA = await makeVerifiedLocatedUser("clerk_ccm_feed_a");
    const userB = await makeVerifiedLocatedUser("clerk_ccm_feed_b");
    const clipA = await insertClip(db, {
      userId: userA.id,
      tier: 1,
      durationSeconds: 15,
      storageUrl: "dev-blob://ccm/feed-a.wav",
      customPromptText: "x",
    });
    const clipB = await insertClip(db, {
      userId: userB.id,
      tier: 1,
      durationSeconds: 15,
      storageUrl: "dev-blob://ccm/feed-b.wav",
      customPromptText: "y",
    });

    // Before the match: each still appears in the other's candidate pool.
    expect((await getBaseCandidateUsers(db, userA.id)).some((row) => row.userId === userB.id)).toBe(true);
    expect((await getBaseCandidateUsers(db, userB.id)).some((row) => row.userId === userA.id)).toBe(true);

    await recordClipViewPosition(db, {
      viewerId: userB.id,
      profileUserId: userA.id,
      clipId: clipA.id,
      reachedEnd: true,
    });
    const aViewsB = await recordClipViewPosition(db, {
      viewerId: userA.id,
      profileUserId: userB.id,
      clipId: clipB.id,
      reachedEnd: true,
    });
    const match = await checkAndCreateMatchIfMutual(db, aViewsB);
    expect(match).not.toBeNull();

    // After the match: gone from each other's pool, both directions —
    // packages/db/src/queries/feed.ts's getBaseCandidateUsers already
    // excludes anyone sharing *any* matches row, which this proves end to
    // end rather than assuming.
    expect((await getBaseCandidateUsers(db, userA.id)).some((row) => row.userId === userB.id)).toBe(false);
    expect((await getBaseCandidateUsers(db, userB.id)).some((row) => row.userId === userA.id)).toBe(false);
  });
});
