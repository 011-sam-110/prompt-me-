# Prompt Me — Roadmap

Milestones for Round 1 (`LOOP.md`). One milestone = one buildable, gated, testable slice. Built in dependency order; within a milestone, independent sub-parts may be split across parallel agents.

### M1: Monorepo scaffold & data model
Status: [x] done (2026-08-24, 4a95770)
Depends on: —
Spec: ENGINEERING_SPEC.md §1, §2
Acceptance:
- [x] `apps/web` (Next.js 15 + TS + Tailwind + shadcn/ui), `packages/core`, `packages/db` exist and build.
- [x] Drizzle schema for every table in ENGINEERING_SPEC.md §2 exists, migrates cleanly against a local/dev Postgres.
- [x] `npm run typecheck && npm run lint && npm run test -- --run` all pass on an empty-but-real app shell.
- [x] README documents local dev setup (env vars, DB migrate command).

### M2: Auth & onboarding shell
Status: [x] done (2026-08-24, pending-commit)
Depends on: M1
Spec: ENGINEERING_SPEC.md §1 (Clerk)
Acceptance:
- [x] Sign-up/sign-in via Clerk creates a `users` row.
- [x] Onboarding shell routes an unverified user toward verification (M3) and blocks feed access until `verification_status = passed`.
- [x] Unit tests cover the account-creation → onboarding-state transition.

### M3: Identity & age verification
Status: [ ]
Depends on: M2
Spec: ENGINEERING_SPEC.md §3
Acceptance:
- [ ] `VerificationProvider` adapter implemented with a deterministic dev-mock and a real Didit implementation behind a feature flag.
- [ ] Liveness/age-check UI flow captures a selfie frame, calls the adapter, writes `verification_records`, and **does not persist the raw frame** — a test asserts no selfie blob exists in storage after a check.
- [ ] A user with `verification_status != passed` cannot appear in another user's feed (tested via M6 once it exists; stub the check here).

### M4: Clip upload & prompt system
Status: [ ]
Depends on: M3
Spec: SPEC.md §2, ENGINEERING_SPEC.md §4
Acceptance:
- [ ] Prompt bank seeded (placeholder 3×4 prompts is fine — real copy is a separate content task) with a free-text custom-prompt path.
- [ ] Upload endpoint rejects tier *N* if tier *N-1* doesn't exist (except tier 1); rejects duration outside tolerance.
- [ ] Successful upload enqueues transcription and moderation (mocked adapters acceptable for now) before `moderation_status` flips to `approved`.
- [ ] Tests cover: sequential-dependency rejection, duration rejection, happy path to `approved`.

### M5: Clip playback engine
Status: [ ]
Depends on: M4
Spec: SPEC.md §3, ENGINEERING_SPEC.md §5
Acceptance:
- [ ] Player enforces no forward-seek; hold-to-2x sets `playbackRate` without jumping `currentTime`.
- [ ] Server (not client) marks `clip_views.completed = true`, driven by reported timeline position.
- [ ] Vertical pass-scroll is locked until 5s elapsed on clip 1; Playwright test demonstrates the lock and its release.
- [ ] Screenshot evidence in `.claude/debug-shots/` of the player mid-clip and post-completion state.

### M6: Discovery feed algorithm
Status: [ ]
Depends on: M4, M5
Spec: SPEC.md §4, ENGINEERING_SPEC.md §6
Acceptance:
- [ ] Location capture stores only a length-5 geohash; a test asserts raw lat/lon is never persisted.
- [ ] Candidate query excludes self, active matches, and blockers; includes only users within `radius_km`.
- [ ] Denied profiles are excluded for 48h then resurface at reduced weight — tested with time-travel/mocked clock.
- [ ] Unverified users (M3) never appear as candidates.

### M7: Match lifecycle & Escape/block
Status: [ ]
Depends on: M6
Spec: SPEC.md §5, ENGINEERING_SPEC.md §7
Acceptance:
- [ ] Mutual full-completion (both directions) creates a `matches` row and removes both users from each other's future candidate queries.
- [ ] One-directional completion does not create a match.
- [ ] Escape sets `matches.status = blocked`, immediately removing the pair from the planning UI and preventing any future feed resurfacing between them.
- [ ] State-machine unit tests cover every transition in the Fig. 2 diagram (SPEC.md/artifact).

### M8: Rewatch mechanic
Status: [ ]
Depends on: M7
Spec: SPEC.md §6, ENGINEERING_SPEC.md §8
Acceptance:
- [ ] Rewatch access is granted/denied server-side per the algorithm in ENGINEERING_SPEC.md §8 — verified with mocked clock across: mid-window, just-expired, still-in-cooldown, cooldown-elapsed.
- [ ] Closing/reopening the client mid-window does not reset the 15-minute countdown (server-timestamp driven, not client state).

### M9: Date planning & calendar
Status: [ ]
Depends on: M7
Spec: SPEC.md §6, ENGINEERING_SPEC.md §9
Acceptance:
- [ ] Busy/available calendar UI per user, visible to an active match.
- [ ] Propose/accept/decline flow with unlimited re-proposals; declining doesn't unmatch.
- [ ] Venue picker only returns public-venue place types; no free-text address bypass exists.
- [ ] A date is "locked" only once idea + slot + venue are all accepted together.

### M10: Date-idea generator
Status: [ ]
Depends on: M4, M9
Spec: SPEC.md §7, ENGINEERING_SPEC.md §10
Acceptance:
- [ ] Given two mocked transcript sets + a shared geohash, the Claude call returns exactly two ideas with a rationale each.
- [ ] Ideas are cached in `date_ideas_generated` per match, not regenerated per proposal.
- [ ] A "suggest new ideas" action forces regeneration.

### M11: Pre-date chat window
Status: [ ]
Depends on: M9
Spec: SPEC.md §8, ENGINEERING_SPEC.md §11
Acceptance:
- [ ] Chat window opens/closes server-side per the T-60min / +4h rule — message-send is rejected outside the window even if the UI is somehow bypassed.
- [ ] Messages deliver in realtime via Pusher between two connected sessions (tested in Playwright with two contexts).
- [ ] Closing a window and locking a next date opens a fresh window at the new T-60min.

### M12: Content moderation pipeline
Status: [ ]
Depends on: M4, M11
Spec: ENGINEERING_SPEC.md §12
Acceptance:
- [ ] Clip upload runs transcript + sampled-frame moderation; a flagged clip stays invisible until a human review action clears it.
- [ ] Chat messages get an async moderation pass without blocking send.
- [ ] A minimal human-review queue UI lists `moderation_flags` awaiting action.

### M13: Notifications
Status: [ ]
Depends on: M7, M9, M11
Spec: ENGINEERING_SPEC.md §14
Acceptance:
- [ ] Email fires for: new match, new proposal, proposal accepted, chat opening in 15 minutes.
- [ ] Notification sending is mockable in tests (no real email sent in the test suite).

---

## Needs from Sampo

Real credentials required before each milestone can run against live services (all have dev-mock fallbacks until then, per the build-gate rule — nothing here blocks the build):
- Clerk API keys (M2)
- Neon Postgres connection string (M1)
- Didit API key (M3)
- OpenAI API key — Whisper + moderation (M4, M12)
- Anthropic API key — date-idea generation (M10)
- Google Places API key (M9)
- Pusher Channels keys (M11)
- Resend API key (M13)
- Confirmation that ENGINEERING_SPEC.md §13's retention defaults (30-day clip purge, 90-day chat retention) are acceptable, or the real numbers to use instead, before public launch.

## Build log

(Appended one line per milestone as Round 1 completes it — see LOOP.md.)

- **M1** (2026-08-24, 4a95770): npm-workspaces monorepo scaffolded (`apps/web` Next.js 15/App Router/TS/Tailwind v4/shadcn-ui, `packages/core`, `packages/db`); Drizzle schema for all 15 ENGINEERING_SPEC.md §2 tables with every FK/CHECK/UNIQUE/enum/cascade rule; generated migration verified against a real embedded Postgres (`@electric-sql/pglite`) in `packages/db/src/schema/schema.test.ts` (36 tests, all green) since no live Neon string exists yet; `getDb()` lazily reads `DATABASE_URL` so a missing credential never blocks typecheck/lint/test/build; `next build` succeeds; README documents env vars + migrate commands.
- **M2** (2026-08-24, pending-commit): Clerk wired into `apps/web` (`@clerk/nextjs`, middleware-based route protection, `/sign-in`, `/sign-up`) behind a real on/off switch (`isClerkConfigured()`) — since no real Clerk keys exist yet, every auth surface (provider, sign-in/up pages, middleware, session lookup) falls back to a cookie-backed dev-mode stub instead, so the app runs and is Playwright-testable with zero credentials. `packages/db/src/queries/users.ts`'s `ensureUserForClerkId` creates a `users` row exactly once per account — enforced by the existing `users_clerk_id_idx` UNIQUE constraint plus `onConflictDoNothing`, proven under concurrent calls in `packages/db/src/queries/users.test.ts` — called from both a Clerk webhook (`api/webhooks/clerk`, real-Clerk-only) and a server-side session check on every authenticated request (`lib/auth/onboarding.ts`, the trigger that actually runs today). `packages/core/src/onboarding.ts` adds a framework/DB-free `onboardingStateForUser` state machine (pending/failed/passed → needs_verification/verification_failed/active) reused by both the DB-layer test and the web app. Since no live Neon string exists either, `packages/db/src/dev-client.ts` adds a file-backed PGlite dev database (`getDevDb()`) so the onboarding gate is genuinely clickable end to end without any credentials — required excluding `@electric-sql/pglite` from webpack via `serverExternalPackages` (bundling it broke its Node fs persistence on Windows). 53 tests green (typecheck/lint/test all pass); Playwright screenshots of the full sign-up → onboarding-blocked → `/feed` redirect flow in `.claude/debug-shots/m2-*.png`.
