// calendar_slots — ENGINEERING_SPEC.md §2, §9; SPEC.md §6.
import { sql } from "drizzle-orm";
import { check, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { calendarSlotStatusEnum } from "./enums";
import { users } from "./users";

export const calendarSlots = pgTable(
  "calendar_slots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    status: calendarSlotStatusEnum("status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [check("calendar_slots_end_after_start", sql`${table.endAt} > ${table.startAt}`)],
);

export type CalendarSlot = typeof calendarSlots.$inferSelect;
export type NewCalendarSlot = typeof calendarSlots.$inferInsert;
