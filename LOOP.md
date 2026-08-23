# Prompt Me — The Build Loop

This is the meta-process wrapping `ROADMAP.md`. It exists so a long autonomous run has an explicit stop condition per round and a persistent log, instead of drifting. Read this before starting or resuming any round.

**Skill substitution note**: the requested "impeccable and taste" pairing for Round 3 maps to the skills actually available: `impeccable` (its design-quality hook already runs automatically on file writes) + `design-review` (blind/persona critique) + `ui-ux-pro-max` / `frontend-design` as needed. No skill literally named "taste" exists — this substitution was disclosed to Sampo, not assumed silently.

## Round 1 — Build

A swarm of agents builds `ROADMAP.md`'s milestones in dependency order. Unlike the default milestone-driver cadence (one milestone, then stop for review), this runs fully autonomously through all milestones — Sampo asked for that explicitly. What replaces the human check between milestones:
- Every milestone still gates on `npm run typecheck && npm run lint && npm run test -- --run` plus its own acceptance checklist before being marked done.
- Every milestone is its own git commit (`M<n>: <name>`, explicit staged paths — never `git add -A`), so the commit history is the audit trail.
- `ROADMAP.md` status and the Build log are updated the moment a milestone completes — the source of truth for "what's done" is that file, not conversation memory.
- A milestone whose acceptance criteria can't be honestly met gets `[!] blocked: <reason>` and a note in *Needs from Sampo* — never marked `[x]` on a failing or skipped gate.

Exit: all of `ROADMAP.md`'s milestones are `[x]`. Proceed to Round 2.

## Round 2 — Spec-compliance audit

A **fresh agent**, with no memory of how Round 1's build decisions were made, reads `SPEC.md`, `ENGINEERING_SPEC.md`, and `ROADMAP.md` end to end, then checks the actual repository against them — not just "does it run," but "does every acceptance box that's checked actually hold, and does anything in SPEC.md have no corresponding implementation at all."

Findings (however small) are appended to `FINDINGS.md` under a new `## Round 2 — pass N (date)` heading — every pass logged, not just the last one, so oscillation between rounds is visible.

- Any findings → back to Round 1, but scoped: only the milestones implicated by the findings get rebuilt/fixed, not a full restart. Re-run Round 2.
- A genuine conflict *within the spec itself* (not a missing implementation, but SPEC.md contradicting itself or ENGINEERING_SPEC.md) is not something Round 2 guesses its way past — log it, stop, and surface it to Sampo. That's the one case where autonomy yields to a real product decision.
- A clean pass (nothing found) → proceed to Round 3.

## Round 3 — UX & logic critique

Playwright-driven persona roleplay with realistic seeded test data (multiple simulated users run through the full journey: onboarding → verification → clip upload → discovery/match → date planning → chat), reviewed through `impeccable` + `design-review` + `ui-ux-pro-max`/`frontend-design` (see skill-substitution note above) for bad UX and through the same personas' actions for logic errors (a state the spec didn't intend to be reachable, a dead end, an inconsistent count, a broken gate).

Findings append to `FINDINGS.md` under `## Round 3 — pass N (date)`. Any finding → fix it, then re-loop within Round 3.

Exit requires **two clean passes, run by two separate agents**, with nothing found in either. Then proceed to Round 4.

## Round 4 — Proof of readiness

Design (mine, as asked): a single evidence report, published as an Artifact so it's reviewable rather than asserted, containing:
- The full `ROADMAP.md` acceptance checklist, all items checked, with commit references.
- Confirmation of the Round 2 clean pass and both Round 3 clean passes, with `FINDINGS.md` linked.
- A recorded end-to-end walkthrough (Playwright screenshots/GIF) of two seeded test accounts going through the entire journey to a locked, chatting date.
- Real test-suite output (pass/fail counts) — never fabricated or represented as passing when it isn't, per how this build reports results throughout.
- An explicit "what's still mocked" list — any adapter still running its dev fallback because a real credential from *Needs from Sampo* hasn't been supplied yet.

This is the deliverable Sampo actually reviews before the build is called done.

## Log files this loop maintains

| File | Written by | Purpose |
|---|---|---|
| `ROADMAP.md` | Round 1 | Milestone status, acceptance criteria, Build log |
| `FINDINGS.md` | Round 2, Round 3 | Append-only audit trail across every pass |
| Git history | All rounds | One commit per milestone/fix, solo attribution |
