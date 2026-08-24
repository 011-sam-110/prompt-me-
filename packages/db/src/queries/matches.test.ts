// ROADMAP.md M7 / ENGINEERING_SPEC.md §7. Same PGlite-against-the-real-
// migration pattern as clip-views.test.ts.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { and, eq } from "drizzle-orm";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "../schema";
import { ensureUserForClerkId } from "./users";
import { ensurePromptsSeeded } from "./prompts";
import { insertMatchIfNotExists } from "./matches";

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../drizzle");

describe("insertMatchIfNotExists", () => {
  let client: PGlite;
  let db: PgliteDatabase<typeof schema>;

  beforeAll(async () => {
    client = new PGlite();
    db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder });
    await ensurePromptsSeeded(db);
  });

  afterAll(async () => {
    await client.close();
  });

  it("creates a matches row for a pair with no prior match", async () => {
    const a = await ensureUserForClerkId(db, "clerk_matches_new_a");
    const b = await ensureUserForClerkId(db, "clerk_matches_new_b");

    const match = await insertMatchIfNotExists(db, { userAId: a.id, userBId: b.id });

    expect(match.userAId).toBe(a.id);
    expect(match.userBId).toBe(b.id);
    expect(match.status).toBe("active");
  });

  it("is idempotent: calling it again for the same canonical pair returns the same row, not a duplicate", async () => {
    const a = await ensureUserForClerkId(db, "clerk_matches_idempotent_a");
    const b = await ensureUserForClerkId(db, "clerk_matches_idempotent_b");

    const first = await insertMatchIfNotExists(db, { userAId: a.id, userBId: b.id });
    const second = await insertMatchIfNotExists(db, { userAId: a.id, userBId: b.id });

    expect(second.id).toBe(first.id);

    const rows = await db
      .select()
      .from(schema.matches)
      .where(and(eq(schema.matches.userAId, a.id), eq(schema.matches.userBId, b.id)));
    expect(rows).toHaveLength(1);
  });
});
