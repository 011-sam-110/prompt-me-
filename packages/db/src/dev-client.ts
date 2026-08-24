// Dev-only fallback database.
//
// getDb() (./client.ts) needs a real Neon connection string, which doesn't
// exist yet (ROADMAP.md -> Needs from Sampo, open since M1). That's fine
// for the build gate — schema/schema.test.ts already proves correctness
// against an in-memory PGlite instance instead — but M2 adds real pages
// that call the database from an actual running request (sign-up ->
// ensureUserForClerkId -> onboarding gate), and those need *something* to
// connect to when someone runs `npm run dev` with no credentials at all.
//
// This mirrors the exact pattern apps/web/src/lib/auth uses for Clerk
// itself ("a dev-mode stub used automatically when ... env vars are
// absent"), applied to persistence: a file-backed PGlite instance,
// auto-migrated on first use, so the M2 flow is genuinely clickable
// end-to-end with zero real credentials. It is never used by getDb()/the
// real Neon path, and callers choose between the two explicitly (see
// apps/web/src/lib/db.ts) based on whether DATABASE_URL is set — this
// module does not read that env var itself.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "./schema";

export type DevDatabase = PgliteDatabase<typeof schema>;

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../drizzle");
// Gitignored (see root .gitignore) — throwaway local data, never meant to
// be shared or committed.
const dataDir = resolve(dirname(fileURLToPath(import.meta.url)), "../.dev-data");

let cached: Promise<DevDatabase> | undefined;

/**
 * Returns a memoized, migrated, file-persisted dev database. Safe to call
 * repeatedly within one process (e.g. across requests, or Next.js hot
 * reloads) — the underlying PGlite instance and its migration are only
 * created/applied once.
 */
export function getDevDb(): Promise<DevDatabase> {
  if (!cached) {
    cached = (async () => {
      const client = new PGlite(dataDir);
      const db = drizzle(client, { schema });
      await migrate(db, { migrationsFolder });
      return db;
    })();
  }
  return cached;
}

/** Test-only escape hatch, mirroring client.ts's __resetDbCacheForTests. */
export function __resetDevDbCacheForTests(): void {
  cached = undefined;
}
