# Prompt Me

Voice-first dating app — no profiles, no photos up front, four escalating spoken prompts, gesture-only matching, no messaging until a real date is locked in.

Full context lives in:
- `SPEC.md` — product specification
- `ENGINEERING_SPEC.md` — technical translation of the spec, including the full data model (§2)
- `ROADMAP.md` — milestones and their acceptance criteria
- `LOOP.md` — the autonomous build process governing this repo

## Repo layout

Light monorepo (npm workspaces):
- `apps/web` — Next.js 15 app (App Router, TypeScript, Tailwind + shadcn/ui)
- `packages/core` — framework-agnostic types + the match/date state machine + feed-ranking logic
- `packages/db` — Drizzle ORM schema and query layer for Postgres/Neon

## Local dev setup

```bash
npm install
```

### Environment variables

Copy `.env.example` to `.env` and fill in what you have:

```bash
cp .env.example .env
```

Every external integration (Neon, Clerk, Didit, OpenAI, Anthropic, Google Places, Pusher, Resend) sits behind an adapter with a dev-mock fallback — a missing credential never blocks a build, typecheck, lint, or test run. `.env.example` notes which milestone first needs each one.

### Database (packages/db)

The schema (every table in `ENGINEERING_SPEC.md` §2) lives in `packages/db/src/schema`. Migrations are managed with [drizzle-kit](https://orm.drizzle.team/kit-docs/overview):

```bash
# From packages/db, after changing a schema file:
npm run db:generate   # writes a new SQL migration into packages/db/drizzle

# Apply migrations to a real Postgres (needs DATABASE_URL set):
npx drizzle-kit migrate
```

No live Neon connection string exists yet (see `ROADMAP.md` → *Needs from Sampo*). Until one does:
- `packages/db/src/client.ts`'s `getDb()` only reads `DATABASE_URL` when actually called — importing the package or running the gate never requires it.
- Schema correctness (every FK, CHECK, UNIQUE, enum, and cascade/restrict delete rule) is verified against a real embedded Postgres instead: `packages/db/src/schema/schema.test.ts` runs the actual generated migration through [`@electric-sql/pglite`](https://pglite.dev/) and asserts on the constraint violations it produces. This is the "local/dev Postgres" the gate exercises until a real Neon database is wired up.
- `apps/web` still needs *something* to persist to when you actually run it (`npm run dev`), so `apps/web/src/lib/db.ts` falls back to `packages/db/src/dev-client.ts`'s file-backed PGlite instance (auto-migrated, gitignored under `packages/db/.dev-data`) whenever `DATABASE_URL` is unset — the same "dev-mode fallback" pattern as auth (below), applied to persistence.

### Auth (Clerk, M2)

No real Clerk keys exist yet either (see `ROADMAP.md` → *Needs from Sampo*). `apps/web/src/lib/auth/config.ts`'s `isClerkConfigured()` checks for both `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`; until both are set, every auth surface automatically falls back to a dev-mode stub instead of the real Clerk SDK:
- `/sign-up` and `/sign-in` render a form that mints a fake `dev_...` account id into a cookie (`apps/web/src/lib/auth/dev-actions.ts`) rather than Clerk's real `<SignUp>`/`<SignIn>`.
- `middleware.ts` protects routes off that cookie instead of a real Clerk session.
- On first sign-in, `ensureUserForClerkId` (`packages/db/src/queries/users.ts`) creates the corresponding `users` row exactly once per account — enforced by the `users_clerk_id_idx` UNIQUE constraint, called from both a server-side session check (the trigger that runs today) and a Clerk webhook (`apps/web/src/app/api/webhooks/clerk`, live once real keys + `CLERK_WEBHOOK_SECRET` exist).

This means the whole sign-up → onboarding-gate flow is exercised in `apps/web/playwright/onboarding.spec.ts` with zero real credentials.

### Gate

```bash
npm run typecheck && npm run lint && npm run test -- --run
```

UI milestones additionally require Playwright screenshot evidence saved to `.claude/debug-shots/` (see `ENGINEERING_SPEC.md` §16):

```bash
# From apps/web — starts its own dev server against the dev-mode
# auth/DB fallbacks above, no credentials needed:
npx playwright test
```
