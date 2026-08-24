import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MAX_RADIUS_KM, MIN_RADIUS_KM } from "@prompt-me/core";
import { ensureUserForClerkId } from "@prompt-me/db";
import * as schema from "@prompt-me/db/schema";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { InvalidRadiusError, setUserSearchRadius } from "./set-radius";

const migrationsFolder = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../packages/db/drizzle",
);

describe("setUserSearchRadius", () => {
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

  it("updates radius_km within the valid range", async () => {
    const user = await ensureUserForClerkId(db, "clerk_setradius_valid");
    const updated = await setUserSearchRadius(db, user.id, 50);
    expect(updated.radiusKm).toBe(50);

    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, user.id));
    expect(row!.radiusKm).toBe(50);
  });

  it("accepts the boundary values", async () => {
    const user = await ensureUserForClerkId(db, "clerk_setradius_bounds");
    expect((await setUserSearchRadius(db, user.id, MIN_RADIUS_KM)).radiusKm).toBe(MIN_RADIUS_KM);
    expect((await setUserSearchRadius(db, user.id, MAX_RADIUS_KM)).radiusKm).toBe(MAX_RADIUS_KM);
  });

  it("rejects an out-of-range radius without touching the database", async () => {
    const user = await ensureUserForClerkId(db, "clerk_setradius_invalid");

    await expect(setUserSearchRadius(db, user.id, 0)).rejects.toBeInstanceOf(InvalidRadiusError);
    await expect(setUserSearchRadius(db, user.id, -5)).rejects.toBeInstanceOf(InvalidRadiusError);
    await expect(setUserSearchRadius(db, user.id, MAX_RADIUS_KM + 1)).rejects.toBeInstanceOf(
      InvalidRadiusError,
    );
    await expect(setUserSearchRadius(db, user.id, Number.NaN)).rejects.toBeInstanceOf(
      InvalidRadiusError,
    );

    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, user.id));
    expect(row!.radiusKm).toBe(25); // unchanged default — every rejected call was a no-op
  });
});
