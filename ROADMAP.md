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
Status: [x] done (2026-08-24, b7c867b)
Depends on: M1
Spec: ENGINEERING_SPEC.md §1 (Clerk)
Acceptance:
- [x] Sign-up/sign-in via Clerk creates a `users` row.
- [x] Onboarding shell routes an unverified user toward verification (M3) and blocks feed access until `verification_status = passed`.
- [x] Unit tests cover the account-creation → onboarding-state transition.

### M3: Identity & age verification
Status: [x] done (2026-08-24, e44103a)
Depends on: M2
Spec: ENGINEERING_SPEC.md §3
Acceptance:
- [x] `VerificationProvider` adapter implemented with a deterministic dev-mock and a real Didit implementation behind a feature flag.
- [x] Liveness/age-check UI flow captures a selfie frame, calls the adapter, writes `verification_records`, and **does not persist the raw frame** — a test asserts no selfie blob exists in storage after a check.
- [x] A user with `verification_status != passed` cannot appear in another user's feed (tested via M6 once it exists; stub the check here).

### M4: Clip upload & prompt system
Status: [x] done (2026-08-24, PENDING_HASH)
Depends on: M3
Spec: SPEC.md §2, ENGINEERING_SPEC.md §4
Acceptance:
- [x] Prompt bank seeded (placeholder 3×4 prompts is fine — real copy is a separate content task) with a free-text custom-prompt path.
- [x] Upload endpoint rejects tier *N* if tier *N-1* doesn't exist (except tier 1); rejects duration outside tolerance.
- [x] Successful upload enqueues transcription and moderation (mocked adapters acceptable for now) before `moderation_status` flips to `approved`.
- [x] Tests cover: sequential-dependency rejection, duration rejection, happy path to `approved`.

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
- FFMPEG_PATH (a real ffmpeg binary path for the deployment target) — for real video frame extraction ahead of moderation (M4/M12); until set, sampled frames are a fixed placeholder image, harmless today since the moderation adapter it feeds is itself still the dev-mock
- Anthropic API key — date-idea generation (M10)
- Google Places API key (M9)
- Pusher Channels keys (M11)
- Resend API key (M13)
- Confirmation that ENGINEERING_SPEC.md §13's retention defaults (30-day clip purge, 90-day chat retention) are acceptable, or the real numbers to use instead, before public launch.

## Build log

(Appended one line per milestone as Round 1 completes it — see LOOP.md.)

- **M1** (2026-08-24, 4a95770): npm-workspaces monorepo scaffolded (`apps/web` Next.js 15/App Router/TS/Tailwind v4/shadcn-ui, `packages/core`, `packages/db`); Drizzle schema for all 15 ENGINEERING_SPEC.md §2 tables with every FK/CHECK/UNIQUE/enum/cascade rule; generated migration verified against a real embedded Postgres (`@electric-sql/pglite`) in `packages/db/src/schema/schema.test.ts` (36 tests, all green) since no live Neon string exists yet; `getDb()` lazily reads `DATABASE_URL` so a missing credential never blocks typecheck/lint/test/build; `next build` succeeds; README documents env vars + migrate commands.
- **M2** (2026-08-24, b7c867b): Clerk wired into `apps/web` (`@clerk/nextjs`, middleware-based route protection, `/sign-in`, `/sign-up`) behind a real on/off switch (`isClerkConfigured()`) — since no real Clerk keys exist yet, every auth surface (provider, sign-in/up pages, middleware, session lookup) falls back to a cookie-backed dev-mode stub instead, so the app runs and is Playwright-testable with zero credentials. `packages/db/src/queries/users.ts`'s `ensureUserForClerkId` creates a `users` row exactly once per account — enforced by the existing `users_clerk_id_idx` UNIQUE constraint plus `onConflictDoNothing`, proven under concurrent calls in `packages/db/src/queries/users.test.ts` — called from both a Clerk webhook (`api/webhooks/clerk`, real-Clerk-only) and a server-side session check on every authenticated request (`lib/auth/onboarding.ts`, the trigger that actually runs today). `packages/core/src/onboarding.ts` adds a framework/DB-free `onboardingStateForUser` state machine (pending/failed/passed → needs_verification/verification_failed/active) reused by both the DB-layer test and the web app. Since no live Neon string exists either, `packages/db/src/dev-client.ts` adds a file-backed PGlite dev database (`getDevDb()`) so the onboarding gate is genuinely clickable end to end without any credentials — required excluding `@electric-sql/pglite` from webpack via `serverExternalPackages` (bundling it broke its Node fs persistence on Windows). 53 tests green (typecheck/lint/test all pass); Playwright screenshots of the full sign-up → onboarding-blocked → `/feed` redirect flow in `.claude/debug-shots/m2-*.png`.
- **M3** (2026-08-24, e44103a): `VerificationProvider` adapter added to `packages/core/src/verification/` — `DevMockVerificationProvider` (always passes both sub-checks with a fixed 0.98 confidence, never even reads its input — ROADMAP's "deterministic dev-mock") and `DiditVerificationProvider` (real HTTP call; endpoint/payload shape flagged inline as a best-effort placeholder pending Sampo's real Didit key, since it's never been exercised against Didit's actual service). `isDiditConfigured()` + `getVerificationProvider()` pick between them exactly on ROADMAP's wording ("used automatically when no Didit key configured") — mirrors `apps/web/src/lib/auth/config.ts`'s `isClerkConfigured()` pattern. `packages/db/src/queries/verification.ts`'s `recordVerificationCheck` writes one `verification_records` row per attempt (a full audit trail, including failed attempts) and applies the derived pass/fail to `users.verification_status`; it builds its insert values field-by-field rather than spreading a result object, and its own parameter type has no field a raw frame could ever occupy — structurally, not just by convention, nothing this deep in the stack can persist a selfie. `apps/web/src/lib/verification/run-check.ts` composes provider + DB write; its own test constructs a canary marker embedded in a fake selfie frame, runs the real flow, then dumps the actual persisted rows and asserts the marker never appears in them — ROADMAP's "a test asserts no selfie blob exists in storage after a check," proven rather than just commented. `packages/core/src/verification/eligibility.ts` adds `isEligibleFeedCandidate` as the stub ROADMAP explicitly asks for, ahead of M6. UI: `components/verification/selfie-capture.tsx` (camera → canvas frame → server action) wired into `/onboarding`, replacing M2's placeholder. Along the way, found and fixed a real bug in M2's `getDevDb()`: Next.js dev mode compiles a Server Action and the page render after it into separate module graphs, so a plain module-scope cache meant the action's DB write and the very next page render's read were silently hitting two different PGlite instances on the same `.dev-data` directory — moved the cache onto `globalThis` (the standard fix for this class of bug). 79 tests green (up from 53 at M2; typecheck/lint/test all pass — `vitest.config.mts` also gained `fileParallelism: false` after parallel PGlite instances OOM'd worker forks on this machine), Playwright screenshots of the real camera-permission → capture → dev-mock-pass → `/feed` unlock flow in `.claude/debug-shots/m3-*.png`.
- **M4 (part 1)** (2026-08-24, e7a241d): prompt bank + clip upload endpoint, the two acceptance bullets that don't depend on transcription/moderation. `packages/db/src/queries/prompts.ts`'s `ensurePromptsSeeded` inserts the placeholder bank (3 × "Tier N prompt A/B/C" per tier, literal placeholder copy — a human writes the real bank later, SPEC.md's Open Questions) behind a new `prompts_tier_text_idx` UNIQUE(tier, text) index + `onConflictDoNothing`, the same concurrency-safe idempotent shape as M2's `ensureUserForClerkId`; called from `dev-client.ts`'s bootstrap so it's seeded with zero manual steps, same as the migration next to it. `packages/core/src/clips/` holds the pure, DB-free upload rules the eventual mobile port can reuse: `checkTierDependency` (tier *N* needs tier *N-1* to already exist, tier 1 exempt), `isDurationWithinTolerance` (±0.5s against each tier's fixed 15s/30s/2min/3min target), and `validatePromptSelection` (curated `promptId` XOR free-text `customPromptText`, matching the DB's XOR check but with a clear reason before it ever reaches Postgres). Duration itself comes from `probeClipDurationSeconds`, which reads the real container-embedded duration via `music-metadata` — never the client's own reported number — with a fallback re-parse (no mimeType hint) when a wrong/imprecise declared content type picks the wrong container parser. Storage: `packages/core/src/storage/` adds `ClipStorageAdapter` (mirrors the verification adapter shape exactly) — `VercelBlobStorageAdapter` (real, via the official `@vercel/blob` SDK rather than hand-rolling its multipart protocol) selected automatically once `BLOB_READ_WRITE_TOKEN` is set, otherwise `MockClipStorageAdapter`, which genuinely writes bytes to a gitignored local directory rather than faking a URL. `apps/web/src/lib/clips/upload.ts`'s `uploadClip` composes all of the above (mirrors `run-check.ts`'s composition style) behind the actual endpoint, `POST /api/clips` (multipart, so the server sees real bytes to measure — a Server Action can't do that honestly). 139 tests green (up from 79 at M3; typecheck/lint/test/`next build` all pass). Deliberately **not done**: clips stay at `moderation_status = "processing"` forever — enqueuing transcription/moderation and flipping it to `approved` is the second half of M4, left for a follow-up so this doesn't overclaim a milestone that isn't actually finished.
- **M4 (part 2 — transcription + moderation)** (2026-08-24, 7757f1e): the async post-upload step ENGINEERING_SPEC §4/§12 describes. `packages/core/src/transcription/` adds a `TranscriptionProvider` adapter — `DevMockTranscriptionProvider` (returns a fixed, deliberately-distinctive placeholder transcript, never reads its input — same shape as M3's `DevMockVerificationProvider`) and `OpenAiWhisperTranscriptionProvider` (real, multipart upload to Whisper's transcription endpoint; never exercised against OpenAI's actual service, same "best-effort, unverified" caveat as M3's Didit provider) selected by `getTranscriptionProvider()` on whether `OPENAI_API_KEY` is set. `packages/core/src/moderation/` mirrors that exactly for OpenAI `omni-moderation-latest` — `DevMockModerationProvider` ("always clean," ignores input) vs. `OpenAiOmniModerationProvider` (real; one HTTP call per text/image item rather than batching, since ENGINEERING_SPEC §1's "in one call" describes the model accepting mixed content, not a batching requirement on this codebase). `packages/core/src/frame-sampling/` adds the "1 frame per 10 seconds of video" rule as a pure, fully-tested `computeFrameSampleTimestamps`, plus its own adapter (`VideoFrameSampler`) since turning a timestamp into a real image needs either a decoder or a mock: `DevMockVideoFrameSampler` returns a placeholder frame (a hand-built, byte-verified 1×1 PNG — signature, chunk CRCs, and inflated pixel data all checked, not just asserted) per requested timestamp, and `FfmpegVideoFrameSampler` (real, shells out to an ffmpeg binary via `child_process.execFile`, gated behind an explicit `FFMPEG_PATH` env var — no deployment target for a real binary has been chosen yet, added to *Needs from Sampo*) is the real path. `packages/core/src/storage/`'s `ClipStorageAdapter` gained a `download(url)` method (both `MockClipStorageAdapter` and `VercelBlobStorageAdapter` implement it) — M4 part 1 only ever wrote clip bytes, never read them back, and this step needs the actual media again. `packages/db`'s `clips` queries gained `getClipById`/`updateClipTranscript`/`updateClipModerationStatus`, and a new `queries/moderation.ts` adds `insertModerationFlag`/`getModerationFlagsForClip` against the `moderation_flags` table that already existed in the schema. `apps/web/src/lib/clips/process-clip.ts`'s `processClipUpload` composes all of the above: downloads the clip, transcribes it, moderates the transcript, and — for a video tier only (tier 1 is audio, SPEC.md §2) — moderates each sampled frame; a clip's `content_type` isn't persisted on the row (no recording UI exists yet with a real codec choice to persist), so processing infers a demuxer hint from the tier's format (audio/video) instead, flagged inline as an engineering default rather than hidden. Any category scoring ≥ `MODERATION_FLAG_THRESHOLD` (0.5, named as its own constant) writes a `moderation_flags` row and the clip lands on `pending_review`; a fully clean run sets `approved`. Wired as "enqueue" in the loosest honest sense — no queue provider exists anywhere in this stack yet, so `api/clips/route.ts` calls `enqueueClipProcessing` without awaiting it, and a failure is caught/logged rather than silently marking a clip approved; documented as the engineering default it is, a fair follow-up once a queue provider is chosen. Tests: `process-clip.test.ts`'s happy path proves an audio-tier clip reaches `approved` via the mocked adapters (transcript = the dev-mock's exact placeholder text, zero `moderation_flags` rows) and a video-tier clip does too with real frame-sampling wired in; a third test flips `OPENAI_API_KEY` on with `fetch` stubbed to force a flagged category, proving the real-adapter-selection path also lands on `pending_review` with the correct `moderation_flags` row recorded — not just the dev-mock path. 201 tests green (up from 139 at M4 part 1; typecheck/lint/test/`next build` all pass).
- **M4** (2026-08-24, PENDING_HASH): closing checkpoint for the milestone, independently re-verified against the real code rather than taken on trust from the two build entries above. Fresh `npm run typecheck && npm run lint && npm run test -- --run` all green (201/201 tests, 42 files). Each acceptance bullet read against its actual implementation: `packages/db/src/queries/prompts.test.ts` proves exactly 12 seeded prompts (3 × 4 tiers) plus a working free-text `customPromptText` path through `validatePromptSelection`'s XOR check; `apps/web/src/lib/clips/upload.test.ts` proves sequential-tier-dependency rejection (`checkTierDependency` — skip-tier-1, skip-tier-3-when-uploading-tier-4) and duration rejection (`isDurationWithinTolerance` against the real, container-measured duration from `probeClipDurationSeconds`, including the exact ±0.5s boundary accepted/rejected on both sides); `apps/web/src/lib/clips/process-clip.test.ts` proves a real audio-tier and a real video-tier clip both reach `approved` through the mocked transcription/moderation/frame-sampling adapters, and a separate test with `OPENAI_API_KEY` set and `fetch` stubbed proves the real-adapter-selection path also lands correctly on `pending_review` with a recorded `moderation_flags` row. No UI surface exists in this milestone (upload is a multipart API endpoint, not a page), so no Playwright evidence applies here — that requirement starts at M5's player per ROADMAP/CLAUDE.md. Work itself: part 1 (e7a241d, prompt bank + upload endpoint) and part 2 (7757f1e, async transcription/moderation pipeline) — see those two entries above for full detail.
