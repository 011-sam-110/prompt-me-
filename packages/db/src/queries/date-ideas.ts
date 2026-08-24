// date_ideas_generated data access — ENGINEERING_SPEC.md §2/§10,
// ROADMAP.md M10. Same mechanical-only split as every other file here: the
// actual "should we regenerate, what do we send Claude" rules live in
// apps/web's lib/date-ideas/get-or-generate-ideas.ts, composed with these
// queries the same way apps/web's lib/date-proposals/propose.ts composes
// @prompt-me/core's rules with queries/date-proposals.ts.
import { and, desc, eq } from "drizzle-orm";
import { dateIdeasGenerated, type DateIdeaGenerated } from "../schema/date-ideas";
import type { AnyDb } from "../types";

export interface InsertGeneratedIdeaInput {
  ideaText: string;
  rationale: string;
}

/**
 * Inserts a fresh pair of generated ideas for a match in a single INSERT
 * statement — deliberately one statement, not two sequential inserts:
 * schema/date-ideas.ts's own header comment documents that "the current
 * pair for a match is simply its two rows with the latest generated_at",
 * and Postgres's `now()` (the column's `defaultNow()`) is stable for the
 * whole duration of one statement/transaction, so both rows land with the
 * identical timestamp that makes them read back as one batch by
 * `getLatestGeneratedIdeasForMatch` below. Two separate `INSERT`s, even
 * back-to-back, would risk two different timestamps and split what should
 * be one pair across two "latest" reads.
 */
export async function insertGeneratedDateIdeas(
  db: AnyDb,
  matchId: string,
  ideas: [InsertGeneratedIdeaInput, InsertGeneratedIdeaInput],
): Promise<DateIdeaGenerated[]> {
  const rows = await db
    .insert(dateIdeasGenerated)
    .values(ideas.map((idea) => ({ matchId, ideaText: idea.ideaText, rationale: idea.rationale })))
    .returning();

  if (rows.length !== 2) {
    throw new Error(`insertGeneratedDateIdeas: expected 2 rows inserted for matchId=${matchId}, got ${rows.length}`);
  }
  return rows;
}

/**
 * The match's current pair of generated ideas — schema/date-ideas.ts's own
 * design: "the two rows with the latest generated_at". Returns fewer than 2
 * rows (0 or, in a corrupted-data edge case, 1) when no pair has ever been
 * generated yet; callers (get-or-generate-ideas.ts) treat anything short of
 * exactly 2 as "no cached ideas — generate a fresh pair" rather than
 * displaying a partial result.
 */
export async function getLatestGeneratedIdeasForMatch(db: AnyDb, matchId: string): Promise<DateIdeaGenerated[]> {
  return db
    .select()
    .from(dateIdeasGenerated)
    .where(eq(dateIdeasGenerated.matchId, matchId))
    .orderBy(desc(dateIdeasGenerated.generatedAt), desc(dateIdeasGenerated.id))
    .limit(2);
}

/**
 * A single generated idea by id, scoped to the match it must belong to —
 * apps/web's lib/date-ideas/propose-generated.ts uses this to resolve a
 * `generatedIdeaId` a proposer picked before writing a `date_proposals` row
 * that references it, and the `matchId` filter is the actual guard against
 * someone submitting an idea id that belongs to a *different* match (the
 * same "re-validate server-side, don't trust the id you were handed" shape
 * set-venue.ts's own header comment documents for a venuePlaceId).
 */
export async function getGeneratedIdeaForMatch(
  db: AnyDb,
  matchId: string,
  ideaId: string,
): Promise<DateIdeaGenerated | undefined> {
  const [row] = await db
    .select()
    .from(dateIdeasGenerated)
    .where(and(eq(dateIdeasGenerated.id, ideaId), eq(dateIdeasGenerated.matchId, matchId)));
  return row;
}
