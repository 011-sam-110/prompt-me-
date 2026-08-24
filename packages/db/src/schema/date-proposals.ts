// date_proposals — ENGINEERING_SPEC.md §2, §9; SPEC.md §6.
//
// `generatedIdeaId` is an addition beyond ENGINEERING_SPEC's listed key
// columns (which name `idea_source`/`idea_text` but not an idea FK):
// `idea_text` is always stored directly (denormalized) so a proposal's
// wording is stable even if the cached idea row is later regenerated, but
// tracing a "generated" proposal back to which cached idea it came from
// is useful and cheap to keep, so it's wired as a nullable FK, required
// exactly when `idea_source = 'generated'` (enforced by CHECK below) and
// left null for `idea_source = 'custom'`.
//
// A date is "locked" (ENGINEERING_SPEC §9 / SPEC.md §6) once idea + slot +
// venue are all agreed — that's a derived/application-level state (a
// `date_proposals` row with `status = 'accepted'` and a non-null
// `venuePlaceId`), not a separate enum value here, since "locked" isn't a
// distinct proposal outcome so much as "accepted, and the venue part of
// acceptance was also filled in."
import { sql } from "drizzle-orm";
import { check, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { ideaSourceEnum, proposalStatusEnum } from "./enums";
import { dateIdeasGenerated } from "./date-ideas";
import { matches } from "./matches";
import { users } from "./users";

export const dateProposals = pgTable(
  "date_proposals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id),
    proposedByUserId: uuid("proposed_by_user_id")
      .notNull()
      .references(() => users.id),
    ideaSource: ideaSourceEnum("idea_source").notNull(),
    ideaText: text("idea_text").notNull(),
    generatedIdeaId: uuid("generated_idea_id").references(() => dateIdeasGenerated.id),
    slotStartAt: timestamp("slot_start_at", { withTimezone: true }).notNull(),
    slotEndAt: timestamp("slot_end_at", { withTimezone: true }).notNull(),
    // Google Places place_id — a public-venue type only, enforced at the
    // application layer's Places query restriction (ENGINEERING_SPEC §9),
    // not something the DB schema can itself constrain.
    venuePlaceId: text("venue_place_id"),
    status: proposalStatusEnum("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("date_proposals_slot_end_after_start", sql`${table.slotEndAt} > ${table.slotStartAt}`),
    check(
      "date_proposals_generated_idea_xor",
      sql`(${table.ideaSource} = 'generated' AND ${table.generatedIdeaId} IS NOT NULL) OR (${table.ideaSource} = 'custom' AND ${table.generatedIdeaId} IS NULL)`,
    ),
  ],
);

export type DateProposal = typeof dateProposals.$inferSelect;
export type NewDateProposal = typeof dateProposals.$inferInsert;
