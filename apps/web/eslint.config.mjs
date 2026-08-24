import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      // next.config.ts: playwright.config.ts's webServer runs with its own
      // isolated build dir (NEXT_DIST_DIR) so it never shares one with
      // another `next dev` that might be running against this same app —
      // its generated route-type files land here and need the same
      // exclusion `.next/**` already gets.
      ".next-playwright/**",
      // Same reasoning as .next-playwright/** above — a one-off manual
      // `next build`/`next dev` run with its own NEXT_DIST_DIR override
      // left this directory untracked in the working tree (found while
      // running the ROADMAP.md M12 gate); gitignored (apps/web/.gitignore)
      // and excluded here so a future stray build dir of this kind can't
      // silently fail `npm run lint` on generated code again.
      ".next-manualcheck/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
];

export default eslintConfig;
