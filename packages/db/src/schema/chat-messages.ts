// chat_messages — ENGINEERING_SPEC.md §2, §11; SPEC.md §8.
//
// Cascades with its window: a chat_window is a self-contained, time-boxed
// artifact, so if one is ever deleted (e.g. as part of the 90-day chat
// retention purge in ENGINEERING_SPEC §13), its messages should go with it
// rather than being orphaned.
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { chatWindows } from "./chat-windows";
import { users } from "./users";

export const chatMessages = pgTable("chat_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  chatWindowId: uuid("chat_window_id")
    .notNull()
    .references(() => chatWindows.id, { onDelete: "cascade" }),
  senderId: uuid("sender_id")
    .notNull()
    .references(() => users.id),
  body: text("body").notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type ChatMessage = typeof chatMessages.$inferSelect;
export type NewChatMessage = typeof chatMessages.$inferInsert;
