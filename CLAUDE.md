# Prompt Me

Voice-first dating app — no profiles, no photos up front, four escalating spoken prompts, gesture-only matching, no messaging until a real date is locked in. Full context: `SPEC.md` (product), `ENGINEERING_SPEC.md` (technical), `ROADMAP.md` (milestones), `LOOP.md` (the 4-round autonomous build process governing this repo).

Read `LOOP.md` before starting or resuming any round — it defines which round is active and what "done" means for that round.

## Build gate
- Roadmap: ROADMAP.md
- Gate: `npm run typecheck && npm run lint && npm run test -- --run`
- Architecture: light monorepo — `apps/web`, `packages/core`, `packages/db` (see ENGINEERING_SPEC.md §1)
- UI evidence: Playwright screenshots to `.claude/debug-shots/` — required for UI milestones
- Commit: one commit per milestone or fix, `M<n>: <name>` or `fix: <what>`, solo attribution, explicit staged paths (never `git add -A` — this machine's repos have held untracked secrets before)

## Conventions
- Every external integration (Clerk, Didit, OpenAI, Anthropic, Google Places, Pusher, Resend) sits behind an adapter with a dev-mock fallback. Missing credentials never block a build — see ROADMAP.md's *Needs from Sampo*.
- `ROADMAP.md` status is the source of truth for what's done. Don't infer progress from conversation history — read the file.
- Spec conflicts (SPEC.md contradicting itself, or ENGINEERING_SPEC.md contradicting SPEC.md) stop the line — log to `FINDINGS.md` and surface to Sampo rather than guessing.
