// packages/db — Drizzle ORM schema + query layer (ENGINEERING_SPEC.md §2).
//
// Schema: every table in ENGINEERING_SPEC.md §2, as pg-core Drizzle table
// definitions in ./schema. Migrations are generated with drizzle-kit
// (see drizzle.config.ts, `npm run db:generate` in this package) into
// ./drizzle. The Neon connection factory in ./client is lazy — see that
// file's comment — so no real DATABASE_URL is required to import this
// package or to typecheck/lint/test it.
export * from "./schema";
export { getDb, __resetDbCacheForTests } from "./client";
export type { Database } from "./client";
export { getDevDb, __resetDevDbCacheForTests } from "./dev-client";
export type { DevDatabase } from "./dev-client";
export type { AnyDb } from "./types";
export * from "./queries";
