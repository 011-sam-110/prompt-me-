// UI evidence for M2 (CLAUDE.md: "UI evidence: Playwright screenshots to
// .claude/debug-shots/ — required for UI milestones"). Runs the dev
// server with no Clerk/DB env vars set on purpose, so this exercises the
// dev-mode auth stub + dev-mode fallback database path exactly as a
// no-credentials clone of this repo would.
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./playwright",
  // A single spec here walks 4-5 fresh routes (/, /sign-up, /onboarding,
  // /feed, /sign-in) against a cold dev server, each paying its own
  // first-compile cost (observed 10-20s for a single route on this
  // machine). 30s was enough for any one step but not enough for the
  // sum across a whole test — bump to give every step its own 15s
  // budget (see `expect.timeout` below) without the wrapping test
  // timeout cutting it off first.
  timeout: 180_000,
  retries: 0,
  reporter: [["list"]],
  // All specs share one dev server (webServer below, reuseExistingServer:
  // false). Two workers hitting it at once means two concurrent
  // first-compiles of different routes on a cold server — on this
  // machine that crashed the dev server mid-request (ECONNRESET/aborted)
  // rather than just running slowly. One worker keeps compiles sequential.
  workers: 1,
  // Dev mode compiles each route on its first request. M3 made
  // /onboarding's first compile noticeably heavier (it now pulls in the
  // camera-capture client component) — observed 2026-08-24 on this
  // machine: the very first "Create a dev account" submission (sign-up's
  // server action -> onboarding's first-ever compile) reliably took
  // longer than the previous 15s budget, every run, not a one-off flake.
  // 45s gives that first request real headroom without masking a genuine
  // regression (a warm second hit in the same file, or a later spec,
  // still resolves in a couple of seconds either way).
  expect: { timeout: 45_000 },
  use: {
    baseURL: "http://localhost:3100",
    // M3's selfie-capture flow calls getUserMedia — there's no real camera
    // on a CI/dev box, so Chromium's fake video device (a synthetic test
    // pattern) stands in, with permission auto-granted rather than prompted.
    permissions: ["camera"],
    launchOptions: {
      args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
    },
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
      DIDIT_API_KEY: "",
    },
  },
});
