// ROADMAP.md M7's Escape/block acceptance bullet: "Escape sets
// matches.status = blocked, immediately removing the pair from the
// planning UI and preventing any future feed resurfacing between them."
// Same PGlite-against-the-real-migration pattern as
// check-and-create-match.test.ts, which this file sits directly alongside.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@prompt-me/db/schema";
import {
  MatchNotFoundError,
  ensurePromptsSeeded,
  ensureUserForClerkId,
  getActiveMatchesForUser,
  getBaseCandidateUsers,
  insertMatchIfNotExists,
  recordVerificationCheck,
  updateUserGeohash,
  type Match,
} from "@prompt-me/db";
import { canonicalizeMatchPair } from "@prompt-me/core";
import { escapeMatch } from "./escape-match";

const migrationsFolder = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../packages/db/drizzle",
);

describe("escapeMatch", () => {
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

  /**
   * Seeds a matches row exactly the way production does — canonicalized
   * first (check-and-create-match.ts always canonicalizes before calling
   * insertMatchIfNotExists; this file's own tests need to mirror that,
   * since `escapeMatch` canonicalizes its own two ids and has to resolve
   * onto whichever row actually exists, not assume the raw call order it
   * was given happens to already be canonical).
   */
  async function makeMatch(userIdX: string, userIdY: string): Promise<Match> {
    const { userAId, userBId } = canonicalizeMatchPair(userIdX, userIdY);
    return insertMatchIfNotExists(db, { userAId, userBId });
  }

  it("blocks the existing match regardless of which of the two users is 'actingUserId'", async () => {
    const a = await ensureUserForClerkId(db, "clerk_escape_direction_a");
    const b = await ensureUserForClerkId(db, "clerk_escape_direction_b");
    const match = await makeMatch(a.id, b.id);

    // b taps Escape on a — canonicalizeMatchPair has to resolve this back
    // onto the same row insertMatchIfNotExists created, not create/hit a
    // different one.
    const blocked = await escapeMatch(db, b.id, a.id);

    expect(blocked.id).toBe(match.id);
    expect(blocked.status).toBe("blocked");
  });

  it("a single tap is enough — one call, no follow-up action needed to fully unmatch", async () => {
    const a = await ensureUserForClerkId(db, "clerk_escape_onetap_a");
    const b = await ensureUserForClerkId(db, "clerk_escape_onetap_b");
    await makeMatch(a.id, b.id);

    const result = await escapeMatch(db, a.id, b.id);
    expect(result.status).toBe("blocked");
  });

  it("throws MatchNotFoundError when the pair never matched — Escape presupposes a live match", async () => {
    const a = await ensureUserForClerkId(db, "clerk_escape_none_a");
    const b = await ensureUserForClerkId(db, "clerk_escape_none_b");

    await expect(escapeMatch(db, a.id, b.id)).rejects.toBeInstanceOf(MatchNotFoundError);
  });

  it("immediately removes the pair from the planning-matches query, both directions", async () => {
    const a = await ensureUserForClerkId(db, "clerk_escape_planning_a");
    const b = await ensureUserForClerkId(db, "clerk_escape_planning_b");
    const match = await makeMatch(a.id, b.id);

    expect((await getActiveMatchesForUser(db, a.id)).map((m) => m.id)).toContain(match.id);
    expect((await getActiveMatchesForUser(db, b.id)).map((m) => m.id)).toContain(match.id);

    await escapeMatch(db, a.id, b.id);

    expect((await getActiveMatchesForUser(db, a.id)).map((m) => m.id)).not.toContain(match.id);
    expect((await getActiveMatchesForUser(db, b.id)).map((m) => m.id)).not.toContain(match.id);
  });

  it("a blocked pair stays excluded from each other's feed candidate pool — the same exclusion an active match already gets, now permanent", async () => {
    const a = await makeVerifiedLocatedUser("clerk_escape_feed_a");
    const b = await makeVerifiedLocatedUser("clerk_escape_feed_b");
    await makeMatch(a.id, b.id);

    // Already excluded while merely "active" (M6's existing exclusion).
    expect((await getBaseCandidateUsers(db, a.id)).some((row) => row.userId === b.id)).toBe(false);

    await escapeMatch(db, a.id, b.id);

    // Still excluded after Escape — proves blocking didn't need to add a
    // *new* exclusion path, only flip the status the existing one already
    // reads regardless of value.
    expect((await getBaseCandidateUsers(db, a.id)).some((row) => row.userId === b.id)).toBe(false);
    expect((await getBaseCandidateUsers(db, b.id)).some((row) => row.userId === a.id)).toBe(false);
  });

  it("this exclusion is total and permanent — unlike SPEC.md §5's 48h/0.3x denied-profile rule, there is no clock to wait out", async () => {
    const a = await makeVerifiedLocatedUser("clerk_escape_permanent_a");
    const b = await makeVerifiedLocatedUser("clerk_escape_permanent_b");
    await makeMatch(a.id, b.id);
    await escapeMatch(db, a.id, b.id);

    // Also give the pair a *stale, long-expired* `denied` feed_decisions
    // row — the shape a merely-recirculated (never-matched) pair would have
    // once its 48h window has long passed, at which point
    // packages/core/src/feed/ranking.ts's isResurfaceEligible would let it
    // back into the pool at a 0.3x penalty. A blocked matches row has to
    // keep winning regardless: getBaseCandidateUsers excludes on the
    // `matches` table alone, with no time parameter at all, so this holds
    // no matter how far "now" ever gets.
    const longAgo = new Date("2020-01-01T00:00:00.000Z");
    await db.insert(schema.feedDecisions).values({
      viewerId: a.id,
      profileUserId: b.id,
      decision: "denied",
      decidedAt: longAgo,
      eligibleAgainAt: new Date(longAgo.getTime() + 48 * 60 * 60 * 1000),
    });

    const rows = await getBaseCandidateUsers(db, a.id);
    expect(rows.some((row) => row.userId === b.id)).toBe(false);
  });
});
