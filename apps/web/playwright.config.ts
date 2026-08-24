// UI evidence for M2 (CLAUDE.md: "UI evidence: Playwright screenshots to
// .claude/debug-shots/ — required for UI milestones"). Runs the dev
// server with no Clerk/DB env vars set on purpose, so this exercises the
// dev-mode auth stub + dev-mode fallback database path exactly as a
// no-credentials clone of this repo would.
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./playwright",
  timeout: 30_000,
  retries: 0,
  reporter: [["list"]],
  // Dev mode compiles each route on its first request, which can push a
  // post-click navigation past the default 5s assertion timeout the
  // first time a given route is hit in a fresh server — not a production
  // concern, just a dev-server artifact.
  expect: { timeout: 15_000 },
  use: {
    baseURL: "http://localhost:3100",
  },
  webServer: {
    command: "npx next dev -p 3100",
    url: "http://localhost:3100",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "",
      CLERK_SECRET_KEY: "",
      CLERK_WEBHOOK_SECRET: "",
      DATABASE_URL: "",
    },
  },
});
