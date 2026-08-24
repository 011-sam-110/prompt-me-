// ROADMAP.md M6 acceptance: "Location capture stores only a length-5
// geohash; a test asserts raw lat/lon is never persisted." Same
// PGlite-against-the-real-migration pattern as
// apps/web/src/lib/verification/run-check.test.ts (M3's equivalent test
// for the raw selfie frame).
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fuzzLocation } from "@prompt-me/core";
import { ensureUserForClerkId } from "@prompt-me/db";
import * as schema from "@prompt-me/db/schema";
import { PGlite } from "@electric-sql/pglite";
import { eq, sql } from "drizzle-orm";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { captureUserLocation } from "./capture-location";

const migrationsFolder = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../packages/db/drizzle",
);

describe("captureUserLocation", () => {
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

  it("stores only a length-5 geohash on users.geohash5", async () => {
    const user = await ensureUserForClerkId(db, "clerk_capture_basic");
    const result = await captureUserLocation(db, user.id, {
      latitude: 51.5074,
      longitude: -0.1278,
    });

    expect(result.geohash5).toHaveLength(5);
    expect(result.user.geohash5).toBe(result.geohash5);

    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, user.id));
    expect(row!.geohash5).toBe(result.geohash5);
  });

  it("never persists the raw latitude/longitude anywhere in the database", async () => {
    const user = await ensureUserForClerkId(db, "clerk_capture_canary");

    // Distinctive, high-precision coordinates a geohash cell's decoded
    // center could never coincidentally reproduce (a cell center sits on a
    // fixed lattice of bisection midpoints, not on an arbitrary 12-digit
    // decimal) — a "canary" value in the same spirit as
    // run-check.test.ts's canary string. If any code path in the capture
    // flow ever wrote the raw floats into a column (directly,
    // string-ified, or via an accidental `...spread`), these exact digits
    // would show up in a dump of every table they could plausibly land in.
    const rawLatitude = 51.500741963258;
    const rawLongitude = -0.127624851937;
    const rawLatitudeStr = String(rawLatitude);
    const rawLongitudeStr = String(rawLongitude);

    const result = await captureUserLocation(db, user.id, {
      latitude: rawLatitude,
      longitude: rawLongitude,
    });

    // Sanity: the geohash really was computed from (and thus depends on)
    // the raw input — this isn't a stub that ignores its arguments.
    expect(result.geohash5).toBe(fuzzLocation(rawLatitude, rawLongitude).geohash5);

    // Dump every table the migration created, not just `users` — proves
    // "never persisted anywhere", not just "not in the one column we
    // expected".
    const { rows: tables } = await db.execute<{ table_name: string }>(
      sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    expect(tables.length).toBeGreaterThan(0);

    for (const { table_name } of tables) {
      const { rows } = await db.execute(sql`SELECT * FROM ${sql.identifier(table_name)}`);
      const dump = JSON.stringify(rows);
      expect(dump, `table "${table_name}" contains the raw latitude`).not.toContain(rawLatitudeStr);
      expect(dump, `table "${table_name}" contains the raw longitude`).not.toContain(rawLongitudeStr);
    }
  });

  it("returns the fuzzed cell's center, not a pass-through of the raw input", async () => {
    const user = await ensureUserForClerkId(db, "clerk_capture_fuzzed");
    const rawLatitude = 51.500741963258;
    const rawLongitude = -0.127624851937;

    const result = await captureUserLocation(db, user.id, {
      latitude: rawLatitude,
      longitude: rawLongitude,
    });

    expect(result.center.latitude).not.toBe(rawLatitude);
    expect(result.center.longitude).not.toBe(rawLongitude);
  });
});
