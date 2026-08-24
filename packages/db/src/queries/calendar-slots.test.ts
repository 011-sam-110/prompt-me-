// ROADMAP.md M9 / ENGINEERING_SPEC.md §2/§9. Same PGlite-against-the-real-
// migration pattern as matches.test.ts/rewatch-sessions.test.ts. Purely
// mechanical coverage — validation/overlap decisions are
// @prompt-me/core's isValidSlotRange/findOverlappingSlot
// (packages/core/src/calendar/slots.test.ts); this file only proves the
// three query functions read/write/delete the right rows, with ownership
// enforced by deleteCalendarSlot's own WHERE clause.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "../schema";
import { ensureUserForClerkId } from "./users";
import { ensurePromptsSeeded } from "./prompts";
import {
  CalendarSlotNotFoundError,
  createCalendarSlot,
  deleteCalendarSlot,
  getCalendarSlotsForUser,
} from "./calendar-slots";

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../drizzle");

describe("calendar-slots queries", () => {
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

  it("getCalendarSlotsForUser returns an empty list for a user with no slots", async () => {
    const user = await ensureUserForClerkId(db, "clerk_calendar_empty");
    expect(await getCalendarSlotsForUser(db, user.id)).toHaveLength(0);
  });

  it("createCalendarSlot persists a row that getCalendarSlotsForUser then returns", async () => {
    const user = await ensureUserForClerkId(db, "clerk_calendar_create");
    const startAt = new Date("2026-09-01T09:00:00.000Z");
    const endAt = new Date("2026-09-01T10:00:00.000Z");

    const created = await createCalendarSlot(db, { userId: user.id, startAt, endAt, status: "busy" });
    expect(created.userId).toBe(user.id);
    expect(created.status).toBe("busy");
    expect(created.startAt.getTime()).toBe(startAt.getTime());
    expect(created.endAt.getTime()).toBe(endAt.getTime());

    const rows = await getCalendarSlotsForUser(db, user.id);
    expect(rows.map((r) => r.id)).toContain(created.id);
  });

  it("getCalendarSlotsForUser orders slots by startAt ascending", async () => {
    const user = await ensureUserForClerkId(db, "clerk_calendar_order");
    const later = await createCalendarSlot(db, {
      userId: user.id,
      startAt: new Date("2026-09-05T00:00:00.000Z"),
      endAt: new Date("2026-09-05T01:00:00.000Z"),
      status: "available",
    });
    const earlier = await createCalendarSlot(db, {
      userId: user.id,
      startAt: new Date("2026-09-02T00:00:00.000Z"),
      endAt: new Date("2026-09-02T01:00:00.000Z"),
      status: "busy",
    });

    const rows = await getCalendarSlotsForUser(db, user.id);
    expect(rows.map((r) => r.id)).toEqual([earlier.id, later.id]);
  });

  it("getCalendarSlotsForUser never returns another user's slots", async () => {
    const owner = await ensureUserForClerkId(db, "clerk_calendar_scope_owner");
    const stranger = await ensureUserForClerkId(db, "clerk_calendar_scope_stranger");
    await createCalendarSlot(db, {
      userId: owner.id,
      startAt: new Date("2026-09-01T09:00:00.000Z"),
      endAt: new Date("2026-09-01T10:00:00.000Z"),
      status: "busy",
    });

    expect(await getCalendarSlotsForUser(db, stranger.id)).toHaveLength(0);
  });

  it("deleteCalendarSlot removes the row when the caller owns it", async () => {
    const user = await ensureUserForClerkId(db, "clerk_calendar_delete_owner");
    const slot = await createCalendarSlot(db, {
      userId: user.id,
      startAt: new Date("2026-09-01T09:00:00.000Z"),
      endAt: new Date("2026-09-01T10:00:00.000Z"),
      status: "busy",
    });

    await deleteCalendarSlot(db, slot.id, user.id);

    expect(await getCalendarSlotsForUser(db, user.id)).toHaveLength(0);
  });

  it("deleteCalendarSlot throws CalendarSlotNotFoundError for an id that doesn't exist", async () => {
    const user = await ensureUserForClerkId(db, "clerk_calendar_delete_missing");
    await expect(
      deleteCalendarSlot(db, "00000000-0000-0000-0000-000000000000", user.id),
    ).rejects.toBeInstanceOf(CalendarSlotNotFoundError);
  });

  it("deleteCalendarSlot throws CalendarSlotNotFoundError when the caller doesn't own the slot — never lets one user delete another's entry", async () => {
    const owner = await ensureUserForClerkId(db, "clerk_calendar_delete_notowner_owner");
    const intruder = await ensureUserForClerkId(db, "clerk_calendar_delete_notowner_intruder");
    const slot = await createCalendarSlot(db, {
      userId: owner.id,
      startAt: new Date("2026-09-01T09:00:00.000Z"),
      endAt: new Date("2026-09-01T10:00:00.000Z"),
      status: "busy",
    });

    await expect(deleteCalendarSlot(db, slot.id, intruder.id)).rejects.toBeInstanceOf(
      CalendarSlotNotFoundError,
    );

    // The row must still exist, untouched, from the owner's own perspective.
    const rows = await getCalendarSlotsForUser(db, owner.id);
    expect(rows.map((r) => r.id)).toContain(slot.id);
  });
});
