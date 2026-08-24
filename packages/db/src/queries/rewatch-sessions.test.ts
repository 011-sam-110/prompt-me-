// ROADMAP.md M8 / ENGINEERING_SPEC.md §8. Same PGlite-against-the-real-
// migration pattern as matches.test.ts. Purely mechanical coverage — the
// grant/deny/create decision itself is @prompt-me/core's
// evaluateRewatchAccess (packages/core/src/rewatch/access.test.ts); this
// file only proves the two query functions read/write the right rows.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "../schema";
import { ensureUserForClerkId } from "./users";
import { ensurePromptsSeeded } from "./prompts";
import { insertMatchIfNotExists } from "./matches";
import { createRewatchSession, getMostRecentRewatchSession } from "./rewatch-sessions";

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../drizzle");
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

describe("rewatch-sessions queries", () => {
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

  it("getMostRecentRewatchSession returns undefined when the viewer has never rewatched this match", async () => {
    const a = await ensureUserForClerkId(db, "clerk_rewatch_none_a");
    const b = await ensureUserForClerkId(db, "clerk_rewatch_none_b");
    const match = await insertMatchIfNotExists(db, { userAId: a.id, userBId: b.id });

    const row = await getMostRecentRewatchSession(db, match.id, a.id);
    expect(row).toBeUndefined();
  });

  it("createRewatchSession persists a row that getMostRecentRewatchSession then returns", async () => {
    const a = await ensureUserForClerkId(db, "clerk_rewatch_create_a");
    const b = await ensureUserForClerkId(db, "clerk_rewatch_create_b");
    const match = await insertMatchIfNotExists(db, { userAId: a.id, userBId: b.id });

    const openedAt = new Date("2026-08-24T12:00:00.000Z");
    const expiresAt = new Date(openedAt.getTime() + 15 * MINUTE_MS);
    const created = await createRewatchSession(db, { matchId: match.id, viewerId: a.id, openedAt, expiresAt });

    expect(created.matchId).toBe(match.id);
    expect(created.viewerId).toBe(a.id);
    expect(created.openedAt.getTime()).toBe(openedAt.getTime());
    expect(created.expiresAt.getTime()).toBe(expiresAt.getTime());

    const fetched = await getMostRecentRewatchSession(db, match.id, a.id);
    expect(fetched?.id).toBe(created.id);
  });

  it("returns the most recently opened session when several exist for the same match/viewer", async () => {
    const a = await ensureUserForClerkId(db, "clerk_rewatch_latest_a");
    const b = await ensureUserForClerkId(db, "clerk_rewatch_latest_b");
    const match = await insertMatchIfNotExists(db, { userAId: a.id, userBId: b.id });

    const older = await createRewatchSession(db, {
      matchId: match.id,
      viewerId: a.id,
      openedAt: new Date("2026-08-20T00:00:00.000Z"),
      expiresAt: new Date("2026-08-20T00:15:00.000Z"),
    });
    const newer = await createRewatchSession(db, {
      matchId: match.id,
      viewerId: a.id,
      openedAt: new Date("2026-08-23T00:00:00.000Z"),
      expiresAt: new Date("2026-08-23T00:15:00.000Z"),
    });

    const fetched = await getMostRecentRewatchSession(db, match.id, a.id);
    expect(fetched?.id).toBe(newer.id);
    expect(fetched?.id).not.toBe(older.id);
  });

  it("scopes strictly to (matchId, viewerId) — the other side of the match has their own independent history", async () => {
    const a = await ensureUserForClerkId(db, "clerk_rewatch_scope_a");
    const b = await ensureUserForClerkId(db, "clerk_rewatch_scope_b");
    const match = await insertMatchIfNotExists(db, { userAId: a.id, userBId: b.id });

    const now = new Date("2026-08-24T12:00:00.000Z");
    await createRewatchSession(db, {
      matchId: match.id,
      viewerId: a.id,
      openedAt: now,
      expiresAt: new Date(now.getTime() + 15 * MINUTE_MS),
    });

    // b has never triggered a rewatch on this match — a's session must not
    // leak across to b's own independent cooldown/window.
    const bSession = await getMostRecentRewatchSession(db, match.id, b.id);
    expect(bSession).toBeUndefined();
  });

  it("scopes strictly to matchId — a viewer's session on a different match doesn't bleed into this one", async () => {
    const a = await ensureUserForClerkId(db, "clerk_rewatch_othermatch_a");
    const b = await ensureUserForClerkId(db, "clerk_rewatch_othermatch_b");
    const c = await ensureUserForClerkId(db, "clerk_rewatch_othermatch_c");
    const matchAB = await insertMatchIfNotExists(db, { userAId: a.id, userBId: b.id });
    const matchAC = await insertMatchIfNotExists(db, { userAId: a.id, userBId: c.id });

    const now = new Date("2026-08-24T12:00:00.000Z");
    await createRewatchSession(db, {
      matchId: matchAB.id,
      viewerId: a.id,
      openedAt: now,
      expiresAt: new Date(now.getTime() + 15 * MINUTE_MS),
    });

    const forOtherMatch = await getMostRecentRewatchSession(db, matchAC.id, a.id);
    expect(forOtherMatch).toBeUndefined();
  });

  it("createRewatchSession allows a later session once an earlier one is long past — no uniqueness constraint blocks a legitimate new window", async () => {
    const a = await ensureUserForClerkId(db, "clerk_rewatch_reopen_a");
    const b = await ensureUserForClerkId(db, "clerk_rewatch_reopen_b");
    const match = await insertMatchIfNotExists(db, { userAId: a.id, userBId: b.id });

    const firstOpenedAt = new Date("2026-08-20T00:00:00.000Z");
    await createRewatchSession(db, {
      matchId: match.id,
      viewerId: a.id,
      openedAt: firstOpenedAt,
      expiresAt: new Date(firstOpenedAt.getTime() + 15 * MINUTE_MS),
    });

    const secondOpenedAt = new Date(firstOpenedAt.getTime() + 30 * HOUR_MS); // well past the 24h cooldown
    const second = await createRewatchSession(db, {
      matchId: match.id,
      viewerId: a.id,
      openedAt: secondOpenedAt,
      expiresAt: new Date(secondOpenedAt.getTime() + 15 * MINUTE_MS),
    });

    const fetched = await getMostRecentRewatchSession(db, match.id, a.id);
    expect(fetched?.id).toBe(second.id);
  });
});
