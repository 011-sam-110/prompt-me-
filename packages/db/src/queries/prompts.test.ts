// ROADMAP.md M4: "Prompt bank seeded... with a free-text custom-prompt
// path." Same PGlite-against-the-real-migration pattern as users.test.ts /
// verification.test.ts — no live Neon database exists yet.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "../schema";
import { PLACEHOLDER_PROMPT_TEXTS, ensurePromptsSeeded, getActivePromptsForTier, getPromptById } from "./prompts";

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../drizzle");

describe("prompts seeding + lookup", () => {
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

  it("seeds exactly 3 active placeholder prompts per tier, 12 total", async () => {
    await ensurePromptsSeeded(db);

    const all = await db.select().from(schema.prompts);
    expect(all).toHaveLength(12);

    for (const tier of [1, 2, 3, 4] as const) {
      const forTier = await getActivePromptsForTier(db, tier);
      expect(forTier).toHaveLength(3);
      expect(forTier.every((p) => p.isActive)).toBe(true);
      expect(forTier.map((p) => p.text).sort()).toEqual([...PLACEHOLDER_PROMPT_TEXTS[tier]].sort());
    }
  });

  it("is idempotent: calling it again does not duplicate rows", async () => {
    await ensurePromptsSeeded(db);
    await ensurePromptsSeeded(db);
    await ensurePromptsSeeded(db);

    const all = await db.select().from(schema.prompts);
    expect(all).toHaveLength(12);
  });

  it("is concurrency-safe: parallel calls never produce duplicates", async () => {
    await Promise.all([ensurePromptsSeeded(db), ensurePromptsSeeded(db), ensurePromptsSeeded(db)]);

    const all = await db.select().from(schema.prompts);
    expect(all).toHaveLength(12);
  });

  it("getPromptById returns the matching row, or undefined for an unknown id", async () => {
    const [somePrompt] = await getActivePromptsForTier(db, 2);
    const found = await getPromptById(db, somePrompt!.id);
    expect(found?.id).toBe(somePrompt!.id);

    const missing = await getPromptById(db, "00000000-0000-0000-0000-000000000000");
    expect(missing).toBeUndefined();
  });

  it("getActivePromptsForTier excludes a deactivated prompt", async () => {
    const [target] = await getActivePromptsForTier(db, 1);
    await db.update(schema.prompts).set({ isActive: false }).where(eq(schema.prompts.id, target!.id));

    const stillActive = await getActivePromptsForTier(db, 1);
    expect(stillActive.map((p) => p.id)).not.toContain(target!.id);
    expect(stillActive).toHaveLength(2);
  });
});
