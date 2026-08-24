// ROADMAP.md M7 / ENGINEERING_SPEC.md §7. Same PGlite-against-the-real-
// migration pattern as clip-views.test.ts.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { and, eq } from "drizzle-orm";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "../schema";
import { ensureUserForClerkId } from "./users";
import { ensurePromptsSeeded } from "./prompts";
import { MatchNotFoundError, blockMatch, getActiveMatchesForUser, insertMatchIfNotExists } from "./matches";

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../drizzle");

describe("insertMatchIfNotExists", () => {
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

  it("creates a matches row for a pair with no prior match", async () => {
    const a = await ensureUserForClerkId(db, "clerk_matches_new_a");
    const b = await ensureUserForClerkId(db, "clerk_matches_new_b");

    const match = await insertMatchIfNotExists(db, { userAId: a.id, userBId: b.id });

    expect(match.userAId).toBe(a.id);
    expect(match.userBId).toBe(b.id);
    expect(match.status).toBe("active");
  });

  it("is idempotent: calling it again for the same canonical pair returns the same row, not a duplicate", async () => {
    const a = await ensureUserForClerkId(db, "clerk_matches_idempotent_a");
    const b = await ensureUserForClerkId(db, "clerk_matches_idempotent_b");

    const first = await insertMatchIfNotExists(db, { userAId: a.id, userBId: b.id });
    const second = await insertMatchIfNotExists(db, { userAId: a.id, userBId: b.id });

    expect(second.id).toBe(first.id);

    const rows = await db
      .select()
      .from(schema.matches)
      .where(and(eq(schema.matches.userAId, a.id), eq(schema.matches.userBId, b.id)));
    expect(rows).toHaveLength(1);
  });
});

describe("blockMatch", () => {
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

  it("flips an active match's status to blocked (SPEC.md §5: 'One tap = unmatch + permanent block')", async () => {
    const a = await ensureUserForClerkId(db, "clerk_block_active_a");
    const b = await ensureUserForClerkId(db, "clerk_block_active_b");
    const match = await insertMatchIfNotExists(db, { userAId: a.id, userBId: b.id });
    expect(match.status).toBe("active");

    const blocked = await blockMatch(db, { userAId: a.id, userBId: b.id });
    expect(blocked.id).toBe(match.id);
    expect(blocked.status).toBe("blocked");
  });

  it("bumps updatedAt on block", async () => {
    const a = await ensureUserForClerkId(db, "clerk_block_updatedat_a");
    const b = await ensureUserForClerkId(db, "clerk_block_updatedat_b");
    const match = await insertMatchIfNotExists(db, { userAId: a.id, userBId: b.id });

    const blocked = await blockMatch(db, { userAId: a.id, userBId: b.id });
    expect(blocked.updatedAt.getTime()).toBeGreaterThanOrEqual(match.updatedAt.getTime());
  });

  it("is idempotent: blocking an already-blocked pair succeeds and stays blocked, no error", async () => {
    const a = await ensureUserForClerkId(db, "clerk_block_idempotent_a");
    const b = await ensureUserForClerkId(db, "clerk_block_idempotent_b");
    await insertMatchIfNotExists(db, { userAId: a.id, userBId: b.id });

    const first = await blockMatch(db, { userAId: a.id, userBId: b.id });
    const second = await blockMatch(db, { userAId: a.id, userBId: b.id });

    expect(first.status).toBe("blocked");
    expect(second.status).toBe("blocked");
    expect(second.id).toBe(first.id);

    const rows = await db
      .select()
      .from(schema.matches)
      .where(and(eq(schema.matches.userAId, a.id), eq(schema.matches.userBId, b.id)));
    expect(rows).toHaveLength(1);
  });

  it("throws MatchNotFoundError when no matches row exists between the pair at all", async () => {
    const a = await ensureUserForClerkId(db, "clerk_block_none_a");
    const b = await ensureUserForClerkId(db, "clerk_block_none_b");

    await expect(blockMatch(db, { userAId: a.id, userBId: b.id })).rejects.toBeInstanceOf(
      MatchNotFoundError,
    );
  });

  it("blocking one pair never touches an unrelated pair's row", async () => {
    const a = await ensureUserForClerkId(db, "clerk_block_isolated_a");
    const b = await ensureUserForClerkId(db, "clerk_block_isolated_b");
    const c = await ensureUserForClerkId(db, "clerk_block_isolated_c");
    const d = await ensureUserForClerkId(db, "clerk_block_isolated_d");
    await insertMatchIfNotExists(db, { userAId: a.id, userBId: b.id });
    const unrelated = await insertMatchIfNotExists(db, { userAId: c.id, userBId: d.id });

    await blockMatch(db, { userAId: a.id, userBId: b.id });

    const [stillActive] = await db.select().from(schema.matches).where(eq(schema.matches.id, unrelated.id));
    expect(stillActive!.status).toBe("active");
  });
});

describe("getActiveMatchesForUser", () => {
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

  it("returns an active match regardless of which side of the pair the user is on", async () => {
    const a = await ensureUserForClerkId(db, "clerk_activematches_a");
    const b = await ensureUserForClerkId(db, "clerk_activematches_b");
    const match = await insertMatchIfNotExists(db, { userAId: a.id, userBId: b.id });

    const fromA = await getActiveMatchesForUser(db, a.id);
    const fromB = await getActiveMatchesForUser(db, b.id);
    expect(fromA.map((m) => m.id)).toContain(match.id);
    expect(fromB.map((m) => m.id)).toContain(match.id);
  });

  it("stops returning a pair the instant it's blocked — 'immediately removing the pair from the planning UI'", async () => {
    const a = await ensureUserForClerkId(db, "clerk_activematches_escaped_a");
    const b = await ensureUserForClerkId(db, "clerk_activematches_escaped_b");
    const match = await insertMatchIfNotExists(db, { userAId: a.id, userBId: b.id });
    expect((await getActiveMatchesForUser(db, a.id)).map((m) => m.id)).toContain(match.id);

    await blockMatch(db, { userAId: a.id, userBId: b.id });

    const afterBlock = await getActiveMatchesForUser(db, a.id);
    expect(afterBlock.map((m) => m.id)).not.toContain(match.id);
    // Symmetric — the other side of the pair loses it from their own
    // planning list too, not just the user who tapped Escape.
    const afterBlockOtherSide = await getActiveMatchesForUser(db, b.id);
    expect(afterBlockOtherSide.map((m) => m.id)).not.toContain(match.id);
  });

  it("never returns a pair that was blocked from the start", async () => {
    const a = await ensureUserForClerkId(db, "clerk_activematches_neveractive_a");
    const b = await ensureUserForClerkId(db, "clerk_activematches_neveractive_b");
    await db.insert(schema.matches).values({ userAId: a.id, userBId: b.id, status: "blocked" });

    const rows = await getActiveMatchesForUser(db, a.id);
    expect(rows).toHaveLength(0);
  });

  it("doesn't return another user's unrelated matches", async () => {
    const a = await ensureUserForClerkId(db, "clerk_activematches_unrelated_a");
    const b = await ensureUserForClerkId(db, "clerk_activematches_unrelated_b");
    const stranger = await ensureUserForClerkId(db, "clerk_activematches_unrelated_stranger");
    await insertMatchIfNotExists(db, { userAId: a.id, userBId: b.id });

    const rows = await getActiveMatchesForUser(db, stranger.id);
    expect(rows).toHaveLength(0);
  });
});
