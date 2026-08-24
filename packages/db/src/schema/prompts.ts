// prompts — the curated prompt bank. ENGINEERING_SPEC.md §2, SPEC.md §2.
//
// "3 curated prompts" per tier, tiers 1-4 (SPEC.md §2 table). `is_active`
// supports the "rotation so profiles don't feel static" note without
// deleting prompt history.
import { sql } from "drizzle-orm";
import { boolean, check, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

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
  (table) => [check("prompts_tier_range", sql`${table.tier} BETWEEN 1 AND 4`)],
);
