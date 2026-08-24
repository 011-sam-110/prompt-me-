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

### Gate

```bash
npm run typecheck && npm run lint && npm run test -- --run
```

UI milestones additionally require Playwright screenshot evidence saved to `.claude/debug-shots/` (see `ENGINEERING_SPEC.md` §16).
