// drizzle-kit config for migration generation (ROADMAP.md M1, ENGINEERING_SPEC.md §1/§2).
//
// `dbCredentials.url` only matters for commands that need a live
// connection (`push`, `migrate`, `studio`, `introspect`) — `generate`
// (the one M1 actually runs) only reads the TS schema files below and
// never connects. The placeholder keeps this config valid/typecheckable
// even with no real Neon connection string set yet (see
// ROADMAP.md → Needs from Sampo).
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://placeholder:placeholder@localhost:5432/placeholder",
  },
});
