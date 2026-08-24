// Which database a request should use. Independent of the Clerk on/off
// switch (apps/web/src/lib/auth/config.ts) — this checks DATABASE_URL
// directly, since a real Neon connection string and real Clerk keys are
// two separate "Needs from Sampo" items that can arrive on different
// timelines (ROADMAP.md).
import { getDb, getDevDb, type AnyDb } from "@prompt-me/db";

/** Pure decision, split out from getAppDb() so it's testable without
 * actually constructing either database (getDevDb() has a real
 * filesystem/WASM-Postgres side effect not worth paying for in a unit
 * test just to check which branch a boolean takes). */
export function shouldUseRealDb(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/**
 * The database for the current environment: the real Neon-backed one
 * (getDb()) when DATABASE_URL is set, otherwise the local dev-only
 * fallback (getDevDb() — packages/db/src/dev-client.ts) so pages that
 * touch the database still work with zero real credentials.
 */
export async function getAppDb(): Promise<AnyDb> {
  return shouldUseRealDb() ? getDb() : getDevDb();
}
