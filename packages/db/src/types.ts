// Driver-agnostic database type — ENGINEERING_SPEC.md §1.
//
// Query functions in ./queries are typed against this instead of the
// concrete `Database` (Neon HTTP) alias from ./client, so the exact same
// function works against either the real Neon-backed database or the
// PGlite-backed one (./client's getDb() in production, ./dev-client's
// getDevDb() in local dev, or a test's own migrated PGlite instance) —
// they share the same Drizzle query-builder surface, just different
// transports underneath.
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "./schema";

export type AnyDb = PgDatabase<PgQueryResultHKT, typeof schema>;
