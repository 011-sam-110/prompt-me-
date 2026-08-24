// Neon/Postgres connection factory (ENGINEERING_SPEC.md §1).
//
// Deliberately lazy: `DATABASE_URL` isn't read until `getDb()` is actually
// called, so importing this module (or the package barrel) never throws
// just because no real Neon connection string exists yet — see
// ROADMAP.md's "Needs from Sampo" (Neon Postgres connection string, M1)
// and CLAUDE.md's "external credentials never block a build" rule. Callers
// that need a real connection (app route handlers, later milestones) call
// `getDb()`; nothing at M1 does.
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

export type Database = ReturnType<typeof drizzle<typeof schema>>;

let cached: Database | undefined;

/**
 * Returns a memoized Drizzle client bound to `process.env.DATABASE_URL`.
 * Throws only when actually called without that env var set — never at
 * module load / import time.
 */
export function getDb(): Database {
  if (cached) return cached;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Provide a Neon Postgres connection string " +
        "(see ROADMAP.md → Needs from Sampo) before calling getDb().",
    );
  }

  const sql = neon(connectionString);
  cached = drizzle(sql, { schema });
  return cached;
}

/** Test-only escape hatch so repeated calls in a test file don't reuse a stale client. */
export function __resetDbCacheForTests(): void {
  cached = undefined;
}
