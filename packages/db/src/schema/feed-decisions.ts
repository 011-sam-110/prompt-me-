// feed_decisions — ENGINEERING_SPEC.md §2, §6.
//
// Append-only log: a viewer can be denied the same profile more than once
// over time (denied -> 48h exclusion -> resurfaces at reduced weight ->
// denied again), so there is deliberately no uniqueness constraint on
// (viewer_id, profile_user_id) — see enums.ts for the `decision` enum's
// rationale. `eligibleAgainAt` is only meaningful for `denied` rows (the
// 48h resurfacing clock, §6); it is nullable because a `matched` row has
// no resurfacing concept — hard-exclusion for matches is enforced via the
// `matches` table, not this column.
import { pgTable, index, timestamp, uuid } from "drizzle-orm/pg-core";
import { feedDecisionEnum } from "./enums";
import { users } from "./users";

export const feedDecisions = pgTable(
  "feed_decisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    viewerId: uuid("viewer_id")
      .notNull()
      .references(() => users.id),
    profileUserId: uuid("profile_user_id")
      .notNull()
      .references(() => users.id),
    decision: feedDecisionEnum("decision").notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    eligibleAgainAt: timestamp("eligible_again_at", { withTimezone: true }),
  },
  (table) => [
    index("feed_decisions_viewer_profile_idx").on(table.viewerId, table.profileUserId),
    index("feed_decisions_eligible_again_idx").on(table.eligibleAgainAt),
  ],
);

export type FeedDecision = typeof feedDecisions.$inferSelect;
export type NewFeedDecision = typeof feedDecisions.$inferInsert;
