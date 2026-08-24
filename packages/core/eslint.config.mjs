import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**"],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      // Standard escape hatch for a deliberately-unused parameter (e.g. an
      // adapter implementation that must match an interface's arity but
      // ignores the argument) — an underscore prefix marks intent instead
      // of silencing the check package-wide.
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
);
