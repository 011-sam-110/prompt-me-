// prompts — the curated prompt bank. ENGINEERING_SPEC.md §2, SPEC.md §2.
//
// "3 curated prompts" per tier, tiers 1-4 (SPEC.md §2 table). `is_active`
// supports the "rotation so profiles don't feel static" note without
// deleting prompt history.
//
// `unique(tier, text)`: an engineering addition beyond the literal spec
// text, added for ROADMAP.md M4's seed step (queries/prompts.ts's
// `ensurePromptsSeeded`) — it's the same "UNIQUE index + onConflictDoNothing"
// concurrency-safe pattern queries/users.ts's `ensureUserForClerkId`
// established, applied here so seeding the placeholder bank is safe to run
// repeatedly (every dev-DB bootstrap, every deploy) without ever risking a
// duplicate row for the same tier's prompt text.
import { sql } from "drizzle-orm";
import { boolean, check, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const prompts = pgTable(
  "prompts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tier: integer("tier").notNull(),
    text: text("text").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("prompts_tier_range", sql`${table.tier} BETWEEN 1 AND 4`),
    uniqueIndex("prompts_tier_text_idx").on(table.tier, table.text),
  ],
);

export type Prompt = typeof prompts.$inferSelect;
export type NewPrompt = typeof prompts.$inferInsert;
