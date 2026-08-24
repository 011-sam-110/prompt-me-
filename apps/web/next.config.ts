import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Lets Next.js consume the raw TypeScript source of the workspace
  // packages directly (no separate build/publish step needed for them).
  transpilePackages: ["@prompt-me/core", "@prompt-me/db"],
  // @electric-sql/pglite (packages/db's dev-mode fallback database, see
  // dev-client.ts) ships a WASM build with its own Node filesystem
  // persistence logic. Letting webpack bundle/transform it breaks that
  // logic (its internal path handling starts throwing "Received an
  // instance of URL" — reproduced only when run through Next's bundler,
  // never standalone) — excluding it here makes Next resolve it via
  // normal Node require/import at runtime instead, unmodified.
  serverExternalPackages: ["@electric-sql/pglite"],
  // Pin the workspace root explicitly — otherwise Next.js's file-tracing
  // root inference can walk up past the monorepo root to an unrelated
  // lockfile further up the filesystem and misreport the project root.
  outputFileTracingRoot: path.join(__dirname, "../.."),
  // This repo's autonomous build (LOOP.md) runs multiple agents against
  // the same working tree at once, and more than one of them can have its
  // own `next dev` open on this app at the same time (a manual preview on
  // one port, a Playwright-driven UI-evidence run on another). Two `next
  // dev` processes sharing one `.next/` build/cache directory corrupt each
  // other's in-progress compiles — observed as this exact class of bug
  // (ROADMAP.md M5): a Playwright run hanging or `net::ERR_ABORTED`-ing on
  // its very first `page.goto`, with no application error at all, only
  // while another `next dev` was running concurrently against this same
  // app. playwright.config.ts's webServer sets NEXT_DIST_DIR so its own
  // server never shares a build directory with whatever else is running.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
