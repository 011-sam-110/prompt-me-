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
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
];

export default eslintConfig;
