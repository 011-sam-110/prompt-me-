# Prompt Me — Engineering Specification

Translates `SPEC.md` into a buildable system. Where `SPEC.md` left something open and a build needs an answer, this document makes the call explicitly — flagged as an engineering default, not a product decision, so it can be revisited without re-opening the interview.

## 1. Stack

- **App**: Next.js 15 (App Router, Server Actions), TypeScript, Tailwind + shadcn/ui.
- **Repo layout**: light monorepo — `apps/web` (the Next.js app), `packages/core` (framework-agnostic types, the match/date state machine, feed-ranking logic), `packages/db` (Drizzle schema + queries). This exists from milestone 1 specifically so the eventual React Native port (§15) reuses `core`/`db` instead of re-deriving the state machine from the web app.
- **Hosting**: Vercel.
- **DB**: Postgres via Neon, Drizzle ORM.
- **Auth**: Clerk (session/account management only — the liveness/age check in §3 is a separate, custom step layered on top of a Clerk account, not replaced by it).
- **Object storage**: Vercel Blob for clip video/audio files.
- **Realtime**: Pusher Channels, for the time-gated chat (§11) — Vercel functions can't hold long-lived sockets, so chat needs a managed pub/sub layer.
- **Transcription**: OpenAI Whisper API (server-side, on clip upload).
- **Date-idea generation**: Claude (Anthropic API), given transcripts + location.
- **Moderation**: OpenAI `omni-moderation-latest` (accepts both text and image input in one call) — text on transcripts, images on sampled video frames.
- **Age/liveness verification**: Didit (facial age estimation + liveness/face-match).
- **Places (meeting-venue picker)**: Google Places API, restricted to venue categories (see §9).

Every third-party integration in this list sits behind an adapter interface with a mockable dev fallback, per the "external credentials never block a build" rule — see `ROADMAP.md` → *Needs from Sampo* for what real keys are eventually required.

## 2. Data model

| Table | Purpose | Key columns |
|---|---|---|
| `users` | Account record | `clerk_id`, `verification_status`, `geohash5` (fuzzed location), `radius_km`, `created_at` |
| `verification_records` | Liveness/age check outcome — **never stores the raw selfie** (§13) | `user_id`, `liveness_result`, `age_estimate_result`, `confidence`, `checked_at` |
| `prompts` | Curated prompt bank | `tier` (1-4), `text`, `is_active` |
| `clips` | An uploaded clip | `user_id`, `tier`, `duration_seconds`, `storage_url`, `transcript`, `prompt_id` / `custom_prompt_text`, `moderation_status` |
| `clip_views` | Per-viewer, per-clip completion | `viewer_id`, `profile_user_id`, `clip_id`, `completed`, `completed_at` |
| `feed_decisions` | Deny (recirculate) vs. match (hard-exclude) | `viewer_id`, `profile_user_id`, `decision`, `decided_at`, `eligible_again_at` |
| `matches` | A mutual match | `user_a_id`, `user_b_id`, `status` (active/blocked), `matched_at` |
| `rewatch_sessions` | Server-authoritative 24h/15min rewatch gate (§6 of SPEC.md) | `match_id`, `viewer_id`, `opened_at`, `expires_at` |
| `calendar_slots` | Busy/available calendar | `user_id`, `start_at`, `end_at`, `status` |
| `date_ideas_generated` | The 2 AI ideas cached per match | `match_id`, `idea_text`, `rationale`, `generated_at` |
| `date_proposals` | A proposed idea + slot + venue | `match_id`, `proposed_by_user_id`, `idea_source`, `idea_text`, `slot_start_at`, `slot_end_at`, `venue_place_id`, `status` |
| `chat_windows` | Time-gated chat for one locked date | `match_id`, `date_proposal_id`, `opens_at`, `closes_at` |
| `chat_messages` | Messages within a window | `chat_window_id`, `sender_id`, `body`, `sent_at` |
| `reports` | Post-date safety reports | `reporter_id`, `reported_user_id`, `match_id`, `reason`, `status` |
| `moderation_flags` | Automated moderation hits pending human review | `clip_id`/`chat_message_id`, `flag_type`, `confidence`, `reviewed`, `action_taken` |

## 3. Identity & age verification

Adapter: `VerificationProvider.check(selfieFrame, clipFaceSamples) → { livenessResult, ageEstimate, confidence }`. Dev fallback returns a deterministic pass. Real implementation calls Didit.

**Compliance default**: the raw selfie/video frame used for the check is processed in-memory and discarded — only the boolean result + confidence score is persisted (`verification_records`). This treats the selfie as UK GDPR Article 9 special-category (biometric) data and minimizes retention accordingly. A profile cannot go live (appear in any other user's feed) until `verification_status = passed`.

## 4. Clip upload & storage

Sequential dependency (`SPEC.md` §2) enforced server-side on the upload endpoint: reject a tier-*N* upload if tier *N-1* doesn't exist for that user (except tier 1, which has no dependency). Duration is validated server-side against the tier's fixed length (with a small tolerance, e.g. ±0.5s) — never trust client-reported duration.

On successful upload: enqueue transcription (Whisper) and moderation (frame sampling + transcript check, §12) before `moderation_status` flips to `approved` and the clip becomes visible to other users.

## 5. Clip playback engine

Client-side player enforcing `SPEC.md` §3:
- Completion is tracked by **timeline position reached**, reported to the server on `timeupdate`/`ended` — the *server* marks `clip_views.completed = true` when position reaches clip end, not the client alone (a client-only completion flag can be spoofed; the match trigger in §7 must trust the server record).
- Forward-seek is disabled in the player UI; the 2x hold-to-speed control sets `playbackRate = 2` rather than jumping `currentTime`.
- The vertical "pass" scroll gesture is disabled (via a scroll-lock on the container) until `currentTime >= 5s` on clip 1.

## 6. Feed algorithm

**Location fuzzing**: encode raw lat/lon to a **geohash of length 5** (~4.9 km × 4.9 km cells) on the server at the point of location capture; only the geohash cell (decoded back to its center point) is ever stored or used downstream. Raw coordinates are not persisted.

**Candidate query**: users whose `geohash5` falls within the viewer's `radius_km`, excluding: self, anyone in an active `matches` row with the viewer (hard-exclude, permanent), anyone who has blocked the viewer via Escape.

**Ranking** (engineering default — not pinned by the interview, revisit if it feels wrong in Round 3):
- Base score favors freshness (newer/less-shown profiles) with randomized jitter, so no profile is perpetually buried or favored.
- A profile in `feed_decisions` with `decision = denied` gets a score penalty (×0.3) and is excluded entirely from resurfacing for 48 hours (`eligible_again_at`), then resurfaces at the reduced weight — "less likely," not permanently gone, per `SPEC.md` §5.

## 7. Match detection

Server-side, on every `clip_views` write: check whether the viewer has `completed = true` for every clip currently uploaded by the profile owner. When both directions are true (A has completed all of B's clips, and B has completed all of A's), create a `matches` row and remove both from each other's future feed candidate queries (§6 exclusion).

**Engineering default**: completion is evaluated against the clip set as it existed *at viewing time*. If a profile owner uploads a new clip later, it does not retroactively revoke a viewer's already-registered completion — the new clip is simply available for future viewers, and the existing viewer's completion stands.

## 8. Rewatch mechanic

Server-authoritative, not client-trusted (a client-side 15-minute timer can be reset by editing local state). On a rewatch request for a `match_id`:
1. If a `rewatch_sessions` row exists with `now < expires_at`, allow access (still within the open window).
2. Else if the most recent session's `expires_at + 24h > now`, deny with the remaining cooldown time.
3. Else create a new session: `opened_at = now`, `expires_at = now + 15min`.

## 9. Date planning & the venue restriction

Calendar and proposal flow follow `SPEC.md` §6 directly. The meeting-place picker queries Google Places restricted to venue types that are inherently public (`restaurant`, `cafe`, `bar`, `museum`, `park`, `tourist_attraction`, etc.) — residential results are excluded by type filter, and there is no free-text address field that bypasses the picker.

## 10. Date-idea generator

Pipeline: pull both matched users' `clips.transcript` → single Claude call with both transcript sets + the match's shared geohash cell → two generated ideas + a one-line rationale each, written to `date_ideas_generated`. Regenerated once per match (not per proposal) — a declined proposal doesn't necessarily mean the *idea* was bad, so re-proposing (§ `date_proposals`) doesn't require new ideas by default; a manual "suggest new ideas" action can force regeneration.

## 11. The pre-date chat window

`chat_windows.opens_at = date_proposals.slot_start_at - 60min`; `closes_at = slot_start_at + 4h` (engineering default for "a few hours after," per `SPEC.md` §8). Messages send over Pusher for realtime delivery; the window's open/closed state is enforced server-side on the message-send endpoint, not just hidden in the UI.

## 12. Content moderation (engineering default — flagged open in SPEC.md, resolved here)

On upload: transcript → OpenAI moderation (text); 1 sampled frame per 10 seconds of video → OpenAI moderation (image). Any flag above threshold sets `moderation_status = pending_review` and the clip stays invisible to other users until a human clears it via `moderation_flags`; a clean scan sets `approved` immediately with no manual bottleneck for the common case. Chat messages get the same text-moderation pass, async, with `reviewed` follow-up rather than blocking send (blocking would undermine the real-time logistics purpose of the window).

## 13. Data retention (engineering default — flagged open in SPEC.md, resolved here)

- Verification selfies: never persisted (§3).
- Clips: retained while the account is active; soft-deleted then hard-purged 30 days after account deletion.
- Chat messages: retained 90 days after their `chat_window` closes (safety/dispute purposes), then purged.
- These are defaults to unblock the build, not a reviewed privacy policy — flagged in `ROADMAP.md` → Needs from Sampo before public launch.

## 14. Notifications (inferred necessary — not explicit in SPEC.md, but the product doesn't function without it)

Email (via Resend) for: new match, new date proposal, proposal accepted, chat window opening in 15 minutes. Push notifications are deferred to the mobile-port phase (§15) rather than built for web now.

Built ROADMAP.md M13: `packages/core/src/notifications` (adapter — `NotificationProvider`, a Resend implementation, and a genuinely-functional dev-mock the whole test suite runs against, same shape as every other adapter in §1). `apps/web/src/lib/notifications` composes it with `@prompt-me/db` — recipient-email resolution (real Clerk lookup, or a deterministic `.invalid` address in dev mode, since email/name live in Clerk, never in this schema's `users` table) plus the four trigger points. The first three fire inline, awaited, at their write's own composition point (`lib/matches/check-and-create-match.ts` — only when a `matches` row is genuinely new, not on a repeat call for an already-matched pair; `lib/date-proposals/propose.ts` and `lib/date-ideas/propose-generated.ts` — both idea sources; `lib/date-proposals/respond.ts`'s `acceptDate`, never `declineDate`). The fourth (15-minute lead) is clock-driven, not action-driven: a `chat_windows.reminder_sent_at` column (nullable, set once) backs an idempotent poll — `sendDueChatWindowOpeningReminders`, exposed at `/api/cron/chat-window-reminders` and wired to Vercel Cron via `apps/web/vercel.json` — so an overlapping or retried poll never double-sends.

## 15. Mobile port strategy

React Native (Expo), consuming `packages/core` and `packages/db`'s query layer through a thin API client shared with the web app — the state machine and ranking logic are never re-derived, only the UI layer changes. Not built now; the monorepo shape exists from M1 specifically so this doesn't require a rewrite later. Apple Declared Age Range API / Google Play Age Signals API (`SPEC.md` §10) are wired at that point, not before.

## 16. Gate command

```
npm run typecheck && npm run lint && npm run test -- --run
```
UI milestones additionally require Playwright screenshot evidence saved to `.claude/debug-shots/`.
