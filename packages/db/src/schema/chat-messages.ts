// chat_messages — ENGINEERING_SPEC.md §2, §11, §12; SPEC.md §8.
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
  // Set the moment a human reviewer takes down a message a moderation_flag
  // was raised against (ROADMAP.md M12, ENGINEERING_SPEC §12) — null for
  // every message that's never been actioned. A soft-removal, not a
  // delete: the row (and the moderation_flags row that led to it) stays in
  // place as the review record, and `body` is left untouched rather than
  // scrubbed, mirroring how `clips.moderationStatus` gates a clip's
  // *visibility* without ever destroying the underlying row. Read-path
  // callers (lib/chat/get-chat-messages.ts, its chat UI) are responsible
  // for rendering a removed placeholder instead of `body` once this is
  // set — deliberately not a delete of `body` itself, so a reviewer
  // reopening the same flag (or a future appeal) still has the original
  // text to look at.
  removedAt: timestamp("removed_at", { withTimezone: true }),
});

export type ChatMessage = typeof chatMessages.$inferSelect;
export type NewChatMessage = typeof chatMessages.$inferInsert;
