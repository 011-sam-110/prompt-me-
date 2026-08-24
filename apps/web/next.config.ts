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
};

export default nextConfig;
