// users — ENGINEERING_SPEC.md §2, §3, §6.
//
// This table intentionally holds only the app-specific state layered on top
// of a Clerk account (ENGINEERING_SPEC §1: "Auth: Clerk... session/account
// management only"). Profile basics like name/email live in Clerk, not
// here — `clerk_id` is the join key.
import { sql } from "drizzle-orm";
import {
  check,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { userVerificationStatusEnum } from "./enums";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clerkId: varchar("clerk_id", { length: 255 }).notNull(),
    verificationStatus: userVerificationStatusEnum("verification_status")
      .notNull()
      .default("pending"),
    // Length-5 geohash cell (~4.9km x 4.9km), never the raw lat/lon —
    // ENGINEERING_SPEC §6. Null until the user has captured a location.
    geohash5: varchar("geohash5", { length: 5 }),
    // Default of 25km is an engineering default (not spec'd) — a starting
    // radius reasonable for a dating app; user-adjustable from day one.
    radiusKm: integer("radius_km").notNull().default(25),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("users_clerk_id_idx").on(table.clerkId),
    check("users_radius_km_positive", sql`${table.radiusKm} > 0`),
  ],
);
