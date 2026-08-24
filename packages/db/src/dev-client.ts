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
//
// The cache lives on `globalThis`, not a plain module-scope variable —
// found the hard way building M3 (ROADMAP.md): Next.js dev mode compiles
// a Server Action invocation and the page render that follows it into
// separate module graphs, each getting its *own* copy of this module's
// top-level scope. A plain `let cached` meant the action's write (via one
// PGlite instance opened on .dev-data) and the very next page render's
// read (via a second, independently-opened PGlite instance on the same
// directory) were silently talking to two different in-memory database
// objects — the write succeeded, the read that followed it in the same
// user-visible flow just didn't see it yet. `globalThis` is the one
// thing actually shared across every module instantiation in the same
// Node process, which is the standard fix for this exact class of bug
// (the same reason Prisma's own Next.js docs recommend a
// `globalThis`-cached client in dev). Test-only reset
// (`__resetDevDbCacheForTests`) is unaffected — it's per-process anyway.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { ensurePromptsSeeded } from "./queries/prompts";
import * as schema from "./schema";

export type DevDatabase = PgliteDatabase<typeof schema>;

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../drizzle");
// Gitignored (see root .gitignore) — throwaway local data, never meant to
// be shared or committed.
const dataDir = resolve(dirname(fileURLToPath(import.meta.url)), "../.dev-data");

const GLOBAL_KEY = Symbol.for("prompt-me.packages/db.devDbCache");

interface DevDbGlobal {
  [GLOBAL_KEY]?: Promise<DevDatabase>;
}

function globalCache(): DevDbGlobal {
  return globalThis as DevDbGlobal;
}

/**
 * Returns a memoized, migrated, file-persisted dev database. Safe to call
 * repeatedly within one process (e.g. across requests, separate Server
 * Action / Server Component module instances, or Next.js hot reloads) —
 * the underlying PGlite instance and its migration are only created/
 * applied once per process, and every caller gets the same instance.
 */
export function getDevDb(): Promise<DevDatabase> {
  const store = globalCache();
  if (!store[GLOBAL_KEY]) {
    store[GLOBAL_KEY] = (async () => {
      const client = new PGlite(dataDir);
      const db = drizzle(client, { schema });
      await migrate(db, { migrationsFolder });
      // ROADMAP.md M4: the placeholder prompt bank exists with zero manual
      // setup, same "auto-bootstrap on first use" spirit as the migration
      // above — ensurePromptsSeeded is itself idempotent, so this is safe
      // to run on every process start, not just the very first one.
      await ensurePromptsSeeded(db);
      return db;
    })();
  }
  return store[GLOBAL_KEY];
}

/** Test-only escape hatch, mirroring client.ts's __resetDbCacheForTests. */
export function __resetDevDbCacheForTests(): void {
  delete globalCache()[GLOBAL_KEY];
}
