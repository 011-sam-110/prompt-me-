import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Lets Next.js consume the raw TypeScript source of the workspace
  // packages directly (no separate build/publish step needed for them).
  transpilePackages: ["@prompt-me/core", "@prompt-me/db"],
  // Pin the workspace root explicitly — otherwise Next.js's file-tracing
  // root inference can walk up past the monorepo root to an unrelated
  // lockfile further up the filesystem and misreport the project root.
  outputFileTracingRoot: path.join(__dirname, "../.."),
};

export default nextConfig;
