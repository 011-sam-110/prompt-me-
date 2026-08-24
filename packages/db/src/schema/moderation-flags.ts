// moderation_flags — ENGINEERING_SPEC.md §2, §12.
//
// Exactly one of `clip_id`/`chat_message_id` is set per row (a flag is
// always against one specific clip or one specific chat message, never
// both/neither) — enforced by CHECK, mirroring the same pattern used for
// clips' prompt_id/custom_prompt_text.
// `flag_type` is left as free text rather than a pg enum: it's populated
// directly from the moderation provider's own category label (OpenAI
// omni-moderation's categories, e.g. "sexual", "harassment", "violence"),
// and pinning those into a DB enum would mean a migration every time the
// provider's taxonomy changes upstream — text is the more stable choice
// for a passthrough field like this.
import { sql } from "drizzle-orm";
import { boolean, check, pgTable, real, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { moderationActionEnum } from "./enums";
import { chatMessages } from "./chat-messages";
import { clips } from "./clips";

export const moderationFlags = pgTable(
  "moderation_flags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clipId: uuid("clip_id").references(() => clips.id, { onDelete: "cascade" }),
    chatMessageId: uuid("chat_message_id").references(() => chatMessages.id, {
      onDelete: "cascade",
    }),
    flagType: text("flag_type").notNull(),
    // 0.0-1.0 confidence score from the moderation provider.
    confidence: real("confidence").notNull(),
    reviewed: boolean("reviewed").notNull().default(false),
    actionTaken: moderationActionEnum("action_taken"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "moderation_flags_target_xor",
      sql`(${table.clipId} IS NOT NULL) <> (${table.chatMessageId} IS NOT NULL)`,
    ),
  ],
);

export type ModerationFlag = typeof moderationFlags.$inferSelect;
export type NewModerationFlag = typeof moderationFlags.$inferInsert;
