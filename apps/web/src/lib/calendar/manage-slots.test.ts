// ROADMAP.md M9's calendar-half acceptance bullet: "Busy/available calendar
// UI per user." The pure rules already have their own focused coverage
// (packages/core/src/calendar/slots.test.ts) and the raw query layer has
// its own (packages/db/src/queries/calendar-slots.test.ts) — this proves
// they compose correctly through the actual entry point a future calendar
// UI would call, against a real (PGlite) database, the same
// integration-test shape as ../rewatch/request-rewatch-access.test.ts.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@prompt-me/db/schema";
import { ensurePromptsSeeded, ensureUserForClerkId } from "@prompt-me/db";
import {
  InvalidSlotRangeError,
  OverlappingSlotError,
  addCalendarSlot,
  removeCalendarSlot,
} from "./manage-slots";
import { CalendarSlotNotFoundError, getCalendarSlotsForUser } from "@prompt-me/db";

const migrationsFolder = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../packages/db/drizzle",
);

const at = (isoTime: string) => new Date(`2026-09-01T${isoTime}:00.000Z`);

describe("addCalendarSlot / removeCalendarSlot", () => {
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

  it("persists a valid, non-overlapping slot", async () => {
    const user = await ensureUserForClerkId(db, "clerk_manageslots_valid");

    const created = await addCalendarSlot(db, user.id, { startAt: at("09:00"), endAt: at("10:00"), status: "busy" });

    expect(created.userId).toBe(user.id);
    expect(created.status).toBe("busy");
    const rows = await getCalendarSlotsForUser(db, user.id);
    expect(rows.map((r) => r.id)).toContain(created.id);
  });

  it("rejects a range where end is not after start, before ever touching the database", async () => {
    const user = await ensureUserForClerkId(db, "clerk_manageslots_invalidrange");

    await expect(
      addCalendarSlot(db, user.id, { startAt: at("10:00"), endAt: at("09:00"), status: "busy" }),
    ).rejects.toBeInstanceOf(InvalidSlotRangeError);

    expect(await getCalendarSlotsForUser(db, user.id)).toHaveLength(0);
  });

  it("rejects a range that overlaps one of the caller's own existing slots", async () => {
    const user = await ensureUserForClerkId(db, "clerk_manageslots_overlap");
    const existing = await addCalendarSlot(db, user.id, {
      startAt: at("09:00"),
      endAt: at("11:00"),
      status: "busy",
    });

    const attempt = addCalendarSlot(db, user.id, {
      startAt: at("10:00"),
      endAt: at("12:00"),
      status: "available",
    });
    await expect(attempt).rejects.toBeInstanceOf(OverlappingSlotError);
    await expect(attempt).rejects.toMatchObject({ conflictingSlotId: existing.id });

    // The rejected attempt never got written.
    expect(await getCalendarSlotsForUser(db, user.id)).toHaveLength(1);
  });

  it("allows two adjacent (touching, not overlapping) slots for the same user", async () => {
    const user = await ensureUserForClerkId(db, "clerk_manageslots_adjacent");
    await addCalendarSlot(db, user.id, { startAt: at("09:00"), endAt: at("10:00"), status: "busy" });
    const second = await addCalendarSlot(db, user.id, {
      startAt: at("10:00"),
      endAt: at("11:00"),
      status: "available",
    });

    expect(second.id).toBeDefined();
    expect(await getCalendarSlotsForUser(db, user.id)).toHaveLength(2);
  });

  it("never checks overlap against a different user's calendar", async () => {
    const userA = await ensureUserForClerkId(db, "clerk_manageslots_isolated_a");
    const userB = await ensureUserForClerkId(db, "clerk_manageslots_isolated_b");
    await addCalendarSlot(db, userA.id, { startAt: at("09:00"), endAt: at("10:00"), status: "busy" });

    // Same range, different user — must succeed, not collide with A's slot.
    const created = await addCalendarSlot(db, userB.id, {
      startAt: at("09:00"),
      endAt: at("10:00"),
      status: "busy",
    });
    expect(created.userId).toBe(userB.id);
  });

  it("removeCalendarSlot deletes the caller's own slot", async () => {
    const user = await ensureUserForClerkId(db, "clerk_manageslots_remove");
    const slot = await addCalendarSlot(db, user.id, { startAt: at("09:00"), endAt: at("10:00"), status: "busy" });

    await removeCalendarSlot(db, user.id, slot.id);

    expect(await getCalendarSlotsForUser(db, user.id)).toHaveLength(0);
  });

  it("removeCalendarSlot refuses to delete another user's slot", async () => {
    const owner = await ensureUserForClerkId(db, "clerk_manageslots_remove_owner");
    const intruder = await ensureUserForClerkId(db, "clerk_manageslots_remove_intruder");
    const slot = await addCalendarSlot(db, owner.id, { startAt: at("09:00"), endAt: at("10:00"), status: "busy" });

    await expect(removeCalendarSlot(db, intruder.id, slot.id)).rejects.toBeInstanceOf(
      CalendarSlotNotFoundError,
    );
    expect(await getCalendarSlotsForUser(db, owner.id)).toHaveLength(1);
  });

  it("a freed-up range (after removal) can be re-added without an overlap error", async () => {
    const user = await ensureUserForClerkId(db, "clerk_manageslots_readd");
    const slot = await addCalendarSlot(db, user.id, { startAt: at("09:00"), endAt: at("10:00"), status: "busy" });
    await removeCalendarSlot(db, user.id, slot.id);

    const readded = await addCalendarSlot(db, user.id, {
      startAt: at("09:00"),
      endAt: at("10:00"),
      status: "available",
    });
    expect(readded.status).toBe("available");
  });
});
