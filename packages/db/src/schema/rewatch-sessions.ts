// rewatch_sessions — ENGINEERING_SPEC.md §2, §8; SPEC.md §6.
//
// Server-authoritative rewatch window/cooldown. `viewerId` is whichever
// side of the match opened the session — each side gets independent
// cooldowns (the algorithm in §8 is per rewatch request, not per match).
import { pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { matches } from "./matches";
import { users } from "./users";

export const rewatchSessions = pgTable("rewatch_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  matchId: uuid("match_id")
    .notNull()
    .references(() => matches.id),
  viewerId: uuid("viewer_id")
    .notNull()
    .references(() => users.id),
  openedAt: timestamp("opened_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export type RewatchSession = typeof rewatchSessions.$inferSelect;
export type NewRewatchSession = typeof rewatchSessions.$inferInsert;
