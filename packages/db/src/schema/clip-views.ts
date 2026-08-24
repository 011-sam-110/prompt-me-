// clip_views — ENGINEERING_SPEC.md §2, §5, §7.
//
// One row per (viewer, clip): the row is created on first view and updated
// in place as `completed` flips true — ENGINEERING_SPEC §5: "the *server*
// marks clip_views.completed = true when position reaches clip end."
// `viewedAt` (first-seen timestamp) is an addition beyond the spec's listed
// key columns, kept for the same audit-trail reason every other table gets
// a created_at-equivalent.
import { boolean, pgTable, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { clips } from "./clips";
import { users } from "./users";

export const clipViews = pgTable(
  "clip_views",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    viewerId: uuid("viewer_id")
      .notNull()
      .references(() => users.id),
    profileUserId: uuid("profile_user_id")
      .notNull()
      .references(() => users.id),
    clipId: uuid("clip_id")
      .notNull()
      .references(() => clips.id, { onDelete: "cascade" }),
    completed: boolean("completed").notNull().default(false),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    viewedAt: timestamp("viewed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("clip_views_viewer_clip_idx").on(table.viewerId, table.clipId)],
);
