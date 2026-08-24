// ROADMAP.md M10 / ENGINEERING_SPEC.md §2/§10. Same PGlite-against-the-real
// -migration pattern as date-proposals.test.ts. Purely mechanical coverage —
// the "should we regenerate" domain rule lives in apps/web's
// lib/date-ideas/get-or-generate-ideas.ts (its own integration test); this
// file only proves the query functions read/write the right rows.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "../schema";
import { ensureUserForClerkId } from "./users";
import { insertMatchIfNotExists } from "./matches";
import { getGeneratedIdeaForMatch, getLatestGeneratedIdeasForMatch, insertGeneratedDateIdeas } from "./date-ideas";

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../drizzle");

describe("date_ideas_generated queries", () => {
  let client: PGlite;
  let db: PgliteDatabase<typeof schema>;

  beforeAll(async () => {
    client = new PGlite();
    db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder });
  });

  afterAll(async () => {
    await client.close();
  });

  async function makeMatch(clerkIdA: string, clerkIdB: string) {
    const a = await ensureUserForClerkId(db, clerkIdA);
    const b = await ensureUserForClerkId(db, clerkIdB);
    const match = await insertMatchIfNotExists(db, { userAId: a.id, userBId: b.id });
    return { match, a: a.id, b: b.id };
  }

  it("insertGeneratedDateIdeas writes exactly two rows for the match, sharing one generated_at", async () => {
    const { match } = await makeMatch("clerk_di_insert_a", "clerk_di_insert_b");

    const rows = await insertGeneratedDateIdeas(db, match.id, [
      { ideaText: "Coffee at the corner café", rationale: "Both mentioned coffee." },
      { ideaText: "Walk in the botanic gardens", rationale: "Both mentioned nature." },
    ]);

    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.matchId).toBe(match.id);
    }
    expect(rows[0]!.generatedAt.getTime()).toBe(rows[1]!.generatedAt.getTime());
  });

  it("getLatestGeneratedIdeasForMatch returns nothing before any ideas exist", async () => {
    const { match } = await makeMatch("clerk_di_empty_a", "clerk_di_empty_b");
    expect(await getLatestGeneratedIdeasForMatch(db, match.id)).toEqual([]);
  });

  it("getLatestGeneratedIdeasForMatch returns the most recently generated pair, not an older one, and none of another match's", async () => {
    const { match } = await makeMatch("clerk_di_latest_a", "clerk_di_latest_b");
    const { match: otherMatch } = await makeMatch("clerk_di_latest_other_a", "clerk_di_latest_other_b");

    await insertGeneratedDateIdeas(db, match.id, [
      { ideaText: "Old idea one", rationale: "Old rationale one" },
      { ideaText: "Old idea two", rationale: "Old rationale two" },
    ]);
    // A later regeneration ("suggest new ideas") — a fresh pair, not an
    // overwrite of the first one (schema/date-ideas.ts's own comment: no
    // mutation, always a fresh insert preserving history).
    const fresh = await insertGeneratedDateIdeas(db, match.id, [
      { ideaText: "Fresh idea one", rationale: "Fresh rationale one" },
      { ideaText: "Fresh idea two", rationale: "Fresh rationale two" },
    ]);
    await insertGeneratedDateIdeas(db, otherMatch.id, [
      { ideaText: "Unrelated match's idea one", rationale: "x" },
      { ideaText: "Unrelated match's idea two", rationale: "y" },
    ]);

    const latest = await getLatestGeneratedIdeasForMatch(db, match.id);
    expect(latest.map((r) => r.id).sort()).toEqual(fresh.map((r) => r.id).sort());
    expect(latest.every((r) => r.ideaText.startsWith("Fresh"))).toBe(true);
  });

  it("getGeneratedIdeaForMatch resolves an idea scoped to its own match, and nothing for a mismatched match", async () => {
    const { match } = await makeMatch("clerk_di_scope_a", "clerk_di_scope_b");
    const { match: otherMatch } = await makeMatch("clerk_di_scope_other_a", "clerk_di_scope_other_b");

    const [idea] = await insertGeneratedDateIdeas(db, match.id, [
      { ideaText: "Idea one", rationale: "Rationale one" },
      { ideaText: "Idea two", rationale: "Rationale two" },
    ]);

    expect((await getGeneratedIdeaForMatch(db, match.id, idea!.id))?.id).toBe(idea!.id);
    // Same idea id, wrong match — must not resolve (the guard set-venue.ts's
    // own comment describes for a Places id applies identically here).
    expect(await getGeneratedIdeaForMatch(db, otherMatch.id, idea!.id)).toBeUndefined();
    expect(await getGeneratedIdeaForMatch(db, match.id, "00000000-0000-0000-0000-000000000000")).toBeUndefined();
  });
});
