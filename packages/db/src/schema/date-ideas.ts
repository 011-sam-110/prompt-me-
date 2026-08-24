// date_ideas_generated — ENGINEERING_SPEC.md §2, §10; SPEC.md §7.
//
// No extra "which of the two ideas" index column: ENGINEERING_SPEC §10
// says regeneration happens "once per match" and produces "two generated
// ideas" together, so the current pair for a match is simply its two rows
// with the latest `generated_at` — a manual "suggest new ideas" action
// (§10) just inserts a fresh pair with a newer timestamp rather than
// mutating the old one, preserving history.
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { matches } from "./matches";

export const dateIdeasGenerated = pgTable("date_ideas_generated", {
  id: uuid("id").primaryKey().defaultRandom(),
  matchId: uuid("match_id")
    .notNull()
    .references(() => matches.id),
  ideaText: text("idea_text").notNull(),
  rationale: text("rationale").notNull(),
  generatedAt: timestamp("generated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
