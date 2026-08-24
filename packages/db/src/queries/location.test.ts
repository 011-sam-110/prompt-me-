// Same PGlite-against-the-real-migration pattern as ./users.test.ts and
// ./verification.test.ts.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "../schema";
import { ensureUserForClerkId } from "./users";
import { updateUserGeohash, updateUserRadiusKm } from "./location";

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../drizzle");

const NIL_UUID = "00000000-0000-0000-0000-000000000000";

describe("location queries", () => {
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

  describe("updateUserGeohash", () => {
    it("sets geohash5 and returns the updated row", async () => {
      const created = await ensureUserForClerkId(db, "clerk_geohash_set");
      expect(created.geohash5).toBeNull();

      const updated = await updateUserGeohash(db, created.id, "gcpvj");
      expect(updated.geohash5).toBe("gcpvj");

      const [row] = await db.select().from(schema.users).where(eq(schema.users.id, created.id));
      expect(row!.geohash5).toBe("gcpvj");
    });

    it("leaves radius_km untouched", async () => {
      const created = await ensureUserForClerkId(db, "clerk_geohash_independence");
      await updateUserRadiusKm(db, created.id, 40);
      const updated = await updateUserGeohash(db, created.id, "u4pru");
      expect(updated.radiusKm).toBe(40);
    });

    it("throws for a nonexistent user rather than silently no-op-ing", async () => {
      await expect(updateUserGeohash(db, NIL_UUID, "gcpvj")).rejects.toThrow(
        /no users row found/,
      );
    });
  });

  describe("updateUserRadiusKm", () => {
    it("updates radius_km away from its default and returns the updated row", async () => {
      const created = await ensureUserForClerkId(db, "clerk_radius_set");
      expect(created.radiusKm).toBe(25);

      const updated = await updateUserRadiusKm(db, created.id, 10);
      expect(updated.radiusKm).toBe(10);

      const [row] = await db.select().from(schema.users).where(eq(schema.users.id, created.id));
      expect(row!.radiusKm).toBe(10);
    });

    it("leaves geohash5 untouched", async () => {
      const created = await ensureUserForClerkId(db, "clerk_radius_independence");
      await updateUserGeohash(db, created.id, "u4pru");
      const updated = await updateUserRadiusKm(db, created.id, 100);
      expect(updated.geohash5).toBe("u4pru");
    });

    it("throws for a nonexistent user rather than silently no-op-ing", async () => {
      await expect(updateUserRadiusKm(db, NIL_UUID, 10)).rejects.toThrow(/no users row found/);
    });

    it("still rejects a non-positive value at the database's users_radius_km_positive CHECK", async () => {
      const created = await ensureUserForClerkId(db, "clerk_radius_db_check");
      await expect(updateUserRadiusKm(db, created.id, 0)).rejects.toBeDefined();
    });
  });
});

