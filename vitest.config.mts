import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/**/*.{test,spec}.ts", "apps/**/*.{test,spec}.ts"],
    exclude: ["**/node_modules/**", "**/.next/**", "**/dist/**", "**/playwright/**"],
    // M3 brought the number of test files that spin up their own embedded
    // @electric-sql/pglite (a real WASM Postgres) instance to five
    // (schema/users/verification in packages/db, onboarding/run-check in
    // apps/web). Running them in parallel forks — vitest's default — was
    // enough concurrent WASM-Postgres memory pressure to OOM-crash worker
    // processes on this machine (observed 2026-08-24: 4 of 16 files
    // crashed their fork with "Fatal process out of memory"). Running
    // test files one at a time removes the concurrency, not the tests.
    fileParallelism: false,
  },
});
