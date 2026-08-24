// chat_windows — ENGINEERING_SPEC.md §2, §11, §14; SPEC.md §8.
//
// `date_proposal_id` is unique: each locked date gets exactly one window
// ("a fresh chat window each time" for a subsequent date, SPEC.md §8),
// one-to-one with the proposal that locked it.
import { sql } from "drizzle-orm";
import { check, pgTable, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { dateProposals } from "./date-proposals";
import { matches } from "./matches";

export const chatWindows = pgTable(
  "chat_windows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id),
    dateProposalId: uuid("date_proposal_id")
      .notNull()
      .references(() => dateProposals.id),
    opensAt: timestamp("opens_at", { withTimezone: true }).notNull(),
    closesAt: timestamp("closes_at", { withTimezone: true }).notNull(),
    // ROADMAP.md M13 / ENGINEERING_SPEC §14: "chat window opening in 15
    // minutes" is a clock-driven email, not one fired inline with any
    // write — nullable, set exactly once by
    // apps/web/src/lib/notifications/notify-chat-window-opening.ts's
    // sendDueChatWindowOpeningReminders the moment it actually sends this
    // window's reminder. Its only job is dedup: a poll running more often
    // than once per 15-minute lead window (or a retried/overlapping poll)
    // must never send the same "opening soon" email twice for the same
    // window — this column is what makes that idempotent, the same role
    // `verification_records`/`moderation_flags` rows play for their own
    // "has this already happened" checks elsewhere in this schema.
    reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("chat_windows_date_proposal_idx").on(table.dateProposalId),
    check("chat_windows_closes_after_opens", sql`${table.closesAt} > ${table.opensAt}`),
  ],
);

export type ChatWindow = typeof chatWindows.$inferSelect;
export type NewChatWindow = typeof chatWindows.$inferInsert;
