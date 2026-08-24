// clips — ENGINEERING_SPEC.md §2, §4; SPEC.md §2.
//
// Decisions beyond the literal spec text (documented, not silently made):
//  - `unique(user_id, tier)`: SPEC.md's upload chain (§2 "Upload depends
//    on") reads as one clip per tier per user, never a replace-in-place.
//    If re-recording a tier later becomes a real feature, that needs a
//    schema change (e.g. a version/superseded_at column), not just relaxing
//    this constraint.
//  - `promptId`/`customPromptText` are mutually exclusive by CHECK —
//    ENGINEERING_SPEC's key-columns list writes them as "prompt_id /
//    custom_prompt_text", read here as "exactly one of the two".
//  - `promptId` has no ON DELETE action (defaults to RESTRICT): prompts
//    are retired via `is_active`, not hard deletion, and a curated prompt
//    still referenced by a clip must stay in place. (`SET NULL` was
//    considered and rejected — it would conflict with the XOR check
//    above: nulling `prompt_id` on a row whose `custom_prompt_text` is
//    also null would make Postgres re-validate that CHECK during the same
//    delete and reject it, so the delete would still fail, just with a
//    more confusing error. RESTRICT says the same thing more directly.)
import { sql } from "drizzle-orm";
import {
  check,
  integer,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { moderationStatusEnum } from "./enums";
import { prompts } from "./prompts";
import { users } from "./users";

export const clips = pgTable(
  "clips",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    tier: integer("tier").notNull(),
    durationSeconds: real("duration_seconds").notNull(),
    storageUrl: text("storage_url").notNull(),
    // Filled in asynchronously by the Whisper transcription step (§4).
    transcript: text("transcript"),
    promptId: uuid("prompt_id").references(() => prompts.id),
    customPromptText: text("custom_prompt_text"),
    moderationStatus: moderationStatusEnum("moderation_status")
      .notNull()
      .default("processing"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("clips_tier_range", sql`${table.tier} BETWEEN 1 AND 4`),
    check(
      "clips_duration_positive",
      sql`${table.durationSeconds} > 0`,
    ),
    check(
      "clips_prompt_source_xor",
      sql`(${table.promptId} IS NOT NULL) <> (${table.customPromptText} IS NOT NULL)`,
    ),
    uniqueIndex("clips_user_tier_idx").on(table.userId, table.tier),
  ],
);

export type Clip = typeof clips.$inferSelect;
export type NewClip = typeof clips.$inferInsert;
