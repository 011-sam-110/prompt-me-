// matches — ENGINEERING_SPEC.md §2, §7; SPEC.md §5.
//
// `user_a_id`/`user_b_id` are unordered in principle (either user could be
// "a" or "b"); the app layer is responsible for always inserting them in a
// canonical order (e.g. lexicographically smaller UUID first) so the
// `unique(user_a_id, user_b_id)` index actually catches a duplicate pair
// regardless of which side initiated the match — the DB can't express
// "unordered pair uniqueness" directly without an expression index, and a
// plain 2-column unique index only dedupes the order the app already
// commits to. The `user_a_id <> user_b_id` check at least rules out a
// (degenerate, shouldn't-be-possible) self-match at the DB level.
import { sql } from "drizzle-orm";
import { check, pgTable, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { matchStatusEnum } from "./enums";
import { users } from "./users";

export const matches = pgTable(
  "matches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userAId: uuid("user_a_id")
      .notNull()
      .references(() => users.id),
    userBId: uuid("user_b_id")
      .notNull()
      .references(() => users.id),
    status: matchStatusEnum("status").notNull().default("active"),
    matchedAt: timestamp("matched_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("matches_no_self_match", sql`${table.userAId} <> ${table.userBId}`),
    uniqueIndex("matches_user_pair_idx").on(table.userAId, table.userBId),
  ],
);
