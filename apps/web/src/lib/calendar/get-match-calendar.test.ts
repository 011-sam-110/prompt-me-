// ROADMAP.md M9's calendar-half acceptance bullet: "Busy/available calendar
// UI per user, visible to an active match." Proves the visibility rule
// itself — participant guard, active-vs-blocked gate, both sides' slots
// returned — against a real (PGlite) database, the same integration-test
// shape as ../rewatch/request-rewatch-access.test.ts.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@prompt-me/db/schema";
import {
  blockMatch,
  ensurePromptsSeeded,
  ensureUserForClerkId,
  insertMatchIfNotExists,
  type Match,
} from "@prompt-me/db";
import { addCalendarSlot } from "./manage-slots";
import { CalendarMatchAccessError, CalendarMatchNotActiveError, getMatchCalendar } from "./get-match-calendar";

const migrationsFolder = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../packages/db/drizzle",
);

const at = (isoTime: string) => new Date(`2026-09-01T${isoTime}:00.000Z`);

describe("getMatchCalendar", () => {
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

  it("throws CalendarMatchAccessError when matchId doesn't exist at all", async () => {
    const a = await ensureUserForClerkId(db, "clerk_calview_nomatch_a");
    await expect(
      getMatchCalendar(db, "00000000-0000-0000-0000-000000000000", a.id),
    ).rejects.toBeInstanceOf(CalendarMatchAccessError);
  });

  it("throws CalendarMatchAccessError when the caller isn't a participant in the match", async () => {
    const { match } = await makeMatch("clerk_calview_stranger_a", "clerk_calview_stranger_b");
    const stranger = await ensureUserForClerkId(db, "clerk_calview_stranger_c");

    await expect(getMatchCalendar(db, match.id, stranger.id)).rejects.toBeInstanceOf(
      CalendarMatchAccessError,
    );
  });

  it("throws CalendarMatchNotActiveError once the pair has been Escaped", async () => {
    const { match, a } = await makeMatch("clerk_calview_blocked_a", "clerk_calview_blocked_b");
    await blockMatch(db, { userAId: match.userAId, userBId: match.userBId });

    await expect(getMatchCalendar(db, match.id, a)).rejects.toBeInstanceOf(CalendarMatchNotActiveError);
  });

  it("returns both sides' slots for an active match, correctly labeled own vs. other", async () => {
    const { match, a, b } = await makeMatch("clerk_calview_both_a", "clerk_calview_both_b");
    await addCalendarSlot(db, a, { startAt: at("09:00"), endAt: at("10:00"), status: "busy" });
    await addCalendarSlot(db, b, { startAt: at("14:00"), endAt: at("15:00"), status: "available" });

    const result = await getMatchCalendar(db, match.id, a);

    expect(result.matchId).toBe(match.id);
    expect(result.otherUserId).toBe(b);
    expect(result.ownSlots).toHaveLength(1);
    expect(result.ownSlots[0]!.status).toBe("busy");
    expect(result.otherSlots).toHaveLength(1);
    expect(result.otherSlots[0]!.status).toBe("available");
  });

  it("works symmetrically from the other participant's side", async () => {
    const { match, a, b } = await makeMatch("clerk_calview_symmetric_a", "clerk_calview_symmetric_b");
    await addCalendarSlot(db, a, { startAt: at("09:00"), endAt: at("10:00"), status: "busy" });

    const result = await getMatchCalendar(db, match.id, b);

    expect(result.otherUserId).toBe(a);
    expect(result.ownSlots).toHaveLength(0);
    expect(result.otherSlots).toHaveLength(1);
  });

  it("never leaks a third party's slots into a match's calendar view", async () => {
    const { match, a } = await makeMatch("clerk_calview_isolated_a", "clerk_calview_isolated_b");
    const stranger = await ensureUserForClerkId(db, "clerk_calview_isolated_stranger");
    await addCalendarSlot(db, stranger.id, { startAt: at("09:00"), endAt: at("10:00"), status: "busy" });

    const result = await getMatchCalendar(db, match.id, a);

    expect(result.ownSlots).toHaveLength(0);
    expect(result.otherSlots).toHaveLength(0);
  });
});
