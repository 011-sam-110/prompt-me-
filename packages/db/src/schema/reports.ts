// reports — ENGINEERING_SPEC.md §2; SPEC.md's Open Questions list ("in-app
// reporting flow for post-date safety incidents" is explicitly unresolved
// by the interview). `reason` is free text rather than an enum/category
// set — no predefined category list exists anywhere in SPEC.md/
// ENGINEERING_SPEC.md to draw one from, so inventing a fixed category enum
// here would be a bigger unstated product decision than the schema should
// make. `status` values are an engineering default for the same reason
// (see enums.ts).
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { reportStatusEnum } from "./enums";
import { matches } from "./matches";
import { users } from "./users";

export const reports = pgTable("reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  reporterId: uuid("reporter_id")
    .notNull()
    .references(() => users.id),
  reportedUserId: uuid("reported_user_id")
    .notNull()
    .references(() => users.id),
  matchId: uuid("match_id")
    .notNull()
    .references(() => matches.id),
  reason: text("reason").notNull(),
  status: reportStatusEnum("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
