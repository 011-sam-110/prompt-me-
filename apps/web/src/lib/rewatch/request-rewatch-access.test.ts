// ROADMAP.md M8's acceptance bullets, verbatim:
//  - "Rewatch access is granted/denied server-side per the algorithm in
//    ENGINEERING_SPEC.md §8 — verified with mocked clock across: mid-window,
//    just-expired, still-in-cooldown, cooldown-elapsed."
//  - "Closing/reopening the client mid-window does not reset the 15-minute
//    countdown (server-timestamp driven, not client state)."
// The pure decision itself already has focused coverage
// (packages/core/src/rewatch/access.test.ts) and the raw query layer has its
// own (packages/db/src/queries/rewatch-sessions.test.ts) — this proves they
// compose correctly through the actual entry point a future rewatch control
// would call, against a real (PGlite) database, the same integration-test
// shape as ../feed/get-feed.test.ts and ../matches/escape-match.test.ts.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@prompt-me/db/schema";
import { ensurePromptsSeeded, ensureUserForClerkId, insertMatchIfNotExists, type Match } from "@prompt-me/db";
import { REWATCH_COOLDOWN_HOURS, REWATCH_WINDOW_MINUTES } from "@prompt-me/core";
import {
  RewatchMatchAccessError,
  requestRewatchAccess,
} from "./request-rewatch-access";

const migrationsFolder = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../packages/db/drizzle",
);

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

describe("requestRewatchAccess", () => {
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

  async function makeMatch(clerkIdA: string, clerkIdB: string): Promise<{ match: Match; a: string; b: string }> {
    const a = await ensureUserForClerkId(db, clerkIdA);
    const b = await ensureUserForClerkId(db, clerkIdB);
    const match = await insertMatchIfNotExists(db, { userAId: a.id, userBId: b.id });
    return { match, a: a.id, b: b.id };
  }

  it("throws RewatchMatchAccessError when matchId doesn't exist at all", async () => {
    const a = await ensureUserForClerkId(db, "clerk_rewatch_access_nomatch_a");
    await expect(
      requestRewatchAccess(db, "00000000-0000-0000-0000-000000000000", a.id, new Date()),
    ).rejects.toBeInstanceOf(RewatchMatchAccessError);
  });

  it("throws RewatchMatchAccessError when the given viewer isn't a participant in the match", async () => {
    const { match } = await makeMatch("clerk_rewatch_access_stranger_a", "clerk_rewatch_access_stranger_b");
    const stranger = await ensureUserForClerkId(db, "clerk_rewatch_access_stranger_c");

    await expect(requestRewatchAccess(db, match.id, stranger.id, new Date())).rejects.toBeInstanceOf(
      RewatchMatchAccessError,
    );
  });

  it("case 3 (no prior session): creates a brand-new session, opened_at = now, expires_at = now + 15min", async () => {
    const { match, a } = await makeMatch("clerk_rewatch_access_new_a", "clerk_rewatch_access_new_b");
    const now = new Date("2026-08-24T12:00:00.000Z");

    const result = await requestRewatchAccess(db, match.id, a, now);

    expect(result.status).toBe("new");
    if (result.status !== "new") throw new Error("unreachable");
    expect(result.session.matchId).toBe(match.id);
    expect(result.session.viewerId).toBe(a);
    expect(result.session.openedAt.getTime()).toBe(now.getTime());
    expect(result.session.expiresAt.getTime()).toBe(now.getTime() + REWATCH_WINDOW_MINUTES * MINUTE_MS);
  });

  it("case 1 (mid-window): a second request while the window is still open returns the SAME session, no new row", async () => {
    const { match, a } = await makeMatch("clerk_rewatch_access_midwindow_a", "clerk_rewatch_access_midwindow_b");
    const openedAt = new Date("2026-08-24T09:00:00.000Z");

    const first = await requestRewatchAccess(db, match.id, a, openedAt);
    expect(first.status).toBe("new");
    if (first.status !== "new") throw new Error("unreachable");

    const midWindow = new Date(openedAt.getTime() + 7 * MINUTE_MS); // 7 of the 15 minutes elapsed
    const second = await requestRewatchAccess(db, match.id, a, midWindow);

    expect(second.status).toBe("open");
    if (second.status !== "open") throw new Error("unreachable");
    expect(second.session.id).toBe(first.session.id);
    expect(second.session.expiresAt.getTime()).toBe(first.session.expiresAt.getTime());
  });

  it("case 2a (just-expired-into-cooldown): a request the instant the window closes is denied with the full 24h remaining", async () => {
    const { match, a } = await makeMatch("clerk_rewatch_access_justexpired_a", "clerk_rewatch_access_justexpired_b");
    const openedAt = new Date("2026-08-24T09:00:00.000Z");
    await requestRewatchAccess(db, match.id, a, openedAt);

    const rightAtClose = new Date(openedAt.getTime() + REWATCH_WINDOW_MINUTES * MINUTE_MS);
    const result = await requestRewatchAccess(db, match.id, a, rightAtClose);

    expect(result.status).toBe("cooldown");
    if (result.status !== "cooldown") throw new Error("unreachable");
    expect(result.remainingMs).toBe(REWATCH_COOLDOWN_HOURS * HOUR_MS);
    expect(result.cooldownEndsAt.getTime()).toBe(rightAtClose.getTime() + REWATCH_COOLDOWN_HOURS * HOUR_MS);
  });

  it("case 2b (still-in-cooldown): a request partway through the 24h lockout is denied with the correct remaining time", async () => {
    const { match, a } = await makeMatch(
      "clerk_rewatch_access_stillcooldown_a",
      "clerk_rewatch_access_stillcooldown_b",
    );
    const openedAt = new Date("2026-08-24T09:00:00.000Z");
    await requestRewatchAccess(db, match.id, a, openedAt);
    const closedAt = new Date(openedAt.getTime() + REWATCH_WINDOW_MINUTES * MINUTE_MS);

    const tenHoursIntoCooldown = new Date(closedAt.getTime() + 10 * HOUR_MS);
    const result = await requestRewatchAccess(db, match.id, a, tenHoursIntoCooldown);

    expect(result.status).toBe("cooldown");
    if (result.status !== "cooldown") throw new Error("unreachable");
    expect(result.remainingMs).toBe(14 * HOUR_MS); // 24h - 10h elapsed
  });

  it("case 3 (cooldown-elapsed): a request a full 24h after the window closed creates a fresh session", async () => {
    const { match, a } = await makeMatch(
      "clerk_rewatch_access_cooldownelapsed_a",
      "clerk_rewatch_access_cooldownelapsed_b",
    );
    const openedAt = new Date("2026-08-24T09:00:00.000Z");
    const first = await requestRewatchAccess(db, match.id, a, openedAt);
    if (first.status !== "new") throw new Error("unreachable");
    const closedAt = new Date(openedAt.getTime() + REWATCH_WINDOW_MINUTES * MINUTE_MS);

    const wellPastCooldown = new Date(closedAt.getTime() + REWATCH_COOLDOWN_HOURS * HOUR_MS + 5 * MINUTE_MS);
    const result = await requestRewatchAccess(db, match.id, a, wellPastCooldown);

    expect(result.status).toBe("new");
    if (result.status !== "new") throw new Error("unreachable");
    expect(result.session.id).not.toBe(first.session.id);
    expect(result.session.openedAt.getTime()).toBe(wellPastCooldown.getTime());
    expect(result.session.expiresAt.getTime()).toBe(wellPastCooldown.getTime() + REWATCH_WINDOW_MINUTES * MINUTE_MS);
  });

  it("closing and reopening the client mid-window doesn't reset the countdown: three checks across the window all agree on the same expiry, and only ONE row was ever written", async () => {
    const { match, a } = await makeMatch("clerk_rewatch_access_reopen_a", "clerk_rewatch_access_reopen_b");
    const openedAt = new Date("2026-08-24T15:00:00.000Z");

    const opened = await requestRewatchAccess(db, match.id, a, openedAt);
    if (opened.status !== "new") throw new Error("unreachable");
    const originalExpiresAt = opened.session.expiresAt.getTime();

    // Simulates the client closing and reopening at three later points,
    // each still inside the 15-minute window — a fresh page load re-reads
    // whatever's persisted rather than trusting any local countdown state.
    for (const minutesLater of [1, 6, 13]) {
      const reopenedAt = new Date(openedAt.getTime() + minutesLater * MINUTE_MS);
      const check = await requestRewatchAccess(db, match.id, a, reopenedAt);

      expect(check.status).toBe("open");
      if (check.status !== "open") throw new Error("unreachable");
      expect(check.session.id).toBe(opened.session.id);
      // The countdown target never moved, regardless of how many times (or
      // how late into the window) the client re-checked.
      expect(check.session.expiresAt.getTime()).toBe(originalExpiresAt);
    }

    // And exactly one rewatch_sessions row exists for this match/viewer —
    // none of the mid-window re-checks above ever inserted a second one.
    const rows = await db.select().from(schema.rewatchSessions);
    const rowsForThisPair = rows.filter((row) => row.matchId === match.id && row.viewerId === a);
    expect(rowsForThisPair).toHaveLength(1);
  });

  it("each side of a match has an independent window/cooldown — one person's open session doesn't grant or block the other", async () => {
    const { match, a, b } = await makeMatch("clerk_rewatch_access_independent_a", "clerk_rewatch_access_independent_b");
    const now = new Date("2026-08-24T12:00:00.000Z");

    const aResult = await requestRewatchAccess(db, match.id, a, now);
    expect(aResult.status).toBe("new");

    // b has never triggered a rewatch on this match — a's brand-new session
    // must not read as an existing "open" window for b too.
    const bResult = await requestRewatchAccess(db, match.id, b, now);
    expect(bResult.status).toBe("new");
    if (bResult.status !== "new" || aResult.status !== "new") throw new Error("unreachable");
    expect(bResult.session.id).not.toBe(aResult.session.id);
  });
});
