# Prompt Me — Product Specification

Source of truth for *what* the product is. Decided through a structured design interview on 2026-08-23/24. Do not add features here that weren't actually decided — flag gaps in "Open questions" instead, and resolve them via `ENGINEERING_SPEC.md` / `replan` rather than silently inventing behavior while building.

## 1. Thesis

No bios, no photo grids, no interest tags. A profile is up to four spoken answers to prompts, revealed voice-first, face-last. You cannot message your way into a relationship here — you plan a real date, or you don't match at all.

Research grounding:
- **Aron et al. (1997)**, "The experimental generation of interpersonal closeness" — the 36-questions "Fast Friends" procedure, escalating from light to vulnerable, reliably builds closeness between strangers. The four clip tiers mirror that escalation.
- **Joel, Eastwick & Finkel (2017)**, "Is romantic desire predictable?" — a meta-analysis of 350 speed-dating studies found pre-meeting compatibility scores barely predict actual attraction. This is why the candidate feed algorithm (§4) does **not** attempt to score compatibility.
- **Aron & Aron (1986)**, self-expansion model — novel, arousing shared activities deepen relationship quality more than familiar ones. This drives the date-idea generator (§7) toward activities, not just a time/place.

Two rules follow from this and recur everywhere below: **nothing can be skipped**, and **there is no freeform messaging until a real date is imminent**.

## 2. The four clips

| Clip | Duration | Format | Required | Prompt tier | Upload depends on |
|---|---|---|---|---|---|
| 1 | 15 sec | Audio only | **Mandatory** | Icebreaker — voice/personality texture | — |
| 2 | 30 sec | Video | Optional | Light/practical (Aron Set I tier) | Clip 1 |
| 3 | 2 min | Video | Optional | Reflective (Aron Set II tier) | Clip 2 |
| 4 | 3 min | Video | Optional | Vulnerable (Aron Set III tier) | Clip 3 |

- Upload dependency is a strict chain, enforced server-side: you cannot record clip *N+1* until clip *N* exists.
- Each tier offers a shortlist of **3 curated prompts** to choose from, plus a free-text option to write your own.
- Clip 1 prompts are not from Aron's set — they're chosen to carry tone/energy through voice alone (e.g. "what's a sound that instantly makes you happy?").
- Clip 2 prompts skew light/practical (work, a funny story about a friend, 5-year outlook, how they feel about where they live, aspirations).
- Clip 3/4 escalate toward Aron Set II/III style reflection and vulnerability.
- The full curated prompt bank (3 × 4 tiers, with rotation so profiles don't feel static) is a content-authoring task — not specified further here.

## 3. Discovery & the feed gesture

No like/pass buttons anywhere in discovery. The gesture *is* the decision.

- **Vertical scroll** = move to the next candidate. This is the pass gesture. Locked for the first 5 seconds of clip 1 so nobody skips a voice unheard.
- **Lateral scroll** = move between one candidate's own clips, in upload order.
- **Hold-to-2x**: holding the side of the screen speeds playback up. Gating/completion tracking is measured by **position reached in the clip's timeline**, not wall-clock time elapsed — so 2x speed never skips content, only compresses it.
- **No skipping ahead**: each clip must finish before the next unlocks. Rewind/replay is free; forward-scrubbing and jumping to a later clip is not.
- Finishing every clip a profile has uploaded **automatically flags interest** — there is no explicit "like" action.

## 4. The matching algorithm — two jobs, only one is "smart"

**Job 1 — candidate feed (deliberately dumb).** Geolocation radius filter (§9) → freshness/fairness rotation → profiles you've scroll-denied are deprioritized (not excluded, can resurface later) → profiles you've fully matched with are hard-excluded, permanently. No personality inference, no compatibility score — see Joel et al. above.

**Job 2 — date-idea generator (§7).** This is where real algorithmic effort goes, because generating a suggestion from unstructured content is what an LLM is actually good at.

## 5. The match lifecycle

- `InFeed → Recirculated` on scroll-away (deny). Recirculated profiles return to the feed later, at lower priority.
- `InFeed → Matched` only when **both** people finish watching **all** of each other's uploaded clips.
- `Matched → DatesInPlanning`, and the pair is permanently removed from **both** people's future discovery feeds — regardless of what happens with any date.
- `DatesInPlanning`: propose/decline a date idea + slot, unlimited re-proposals (declining a proposal ≠ declining the person).
- `DatesInPlanning → DateLocked` once an idea, a slot, and a public-venue meeting place are all agreed.
- `DateLocked → ChatOpen` at T-60 minutes before the date; `ChatOpen → ChatClosed` some hours after the date.
- `ChatClosed → DatesInPlanning` to plan the next date with the same match (same calendar mechanic, a fresh chat window each time).
- **Escape**: available any time from `DatesInPlanning` onward. One tap = unmatch + permanent block. The only way out of a live match — there's no messaging to say "this isn't working," so this has to be unambiguous.

## 6. Date planning & the calendar

- Each person keeps a busy/available calendar, visible to a match once planning starts.
- Date ideas appear as "cloud" bubbles anchored to calendar dates: the two algorithm-generated ideas (§7), or a custom idea either person writes in.
- Either side proposes idea + slot; the other accepts/declines. Unlimited re-proposals.
- Accepting requires agreeing a **public-venue** meeting place (§9) — a date isn't locked until both an idea/slot *and* a place are settled.

**Rewatching after a match.** Either person can re-open the other's full clip set after matching — a memory refresh before a date, not a one-time first impression.
- 24-hour cooldown between rewatch sessions.
- Triggering one opens a 15-minute access window; closing and reopening the app doesn't reset it — it keeps counting down from when it opened.
- The 24-hour cooldown restarts once that window closes (not from when it opened) — i.e. always a full 24h of lockout between sessions.

## 7. The date-idea generator

Transcribe both matched users' clips (speech-to-text) → extract interests/values/energy from what they actually said → cross-reference both people's content against their shared location → generate two candidate date ideas favoring novel/arousing activities over generic defaults (self-expansion model, §1). Always shown alongside the option to submit a custom idea instead.

## 8. The pre-date chat window

The only messaging surface in the app. Freeform (not preset-replies-only) — real logistics ("running late," "I'm outside") need real text. Opens at T-60min, closes a few hours after the date, then locks again. The app never becomes a standing DM thread — each subsequent date re-opens its own window.

## 9. Location & meeting safety

- Location is fuzzed before it's ever used for matching — an exact address is never stored or shown to another user.
- Each user sets a search radius on top of the fuzzed location.
- Meeting places are restricted to public venues; a residential address cannot be set as a meeting place.

## 10. Identity & age verification

No messaging exists before a date is locked in, so there's no window for red flags to surface in conversation — trust has to be structural, before matching starts.

- A mandatory liveness selfie scan at signup, compared against the faces in a user's uploaded clips (anti-catfish, confirms the account owner is who appears in their content).
- The same flow layers in **facial age estimation** (~$0.10/check, e.g. Didit) to satisfy the UK Online Safety Act's requirement that self-declaration alone is insufficient.
- No government ID document is collected.
- Once a native mobile app ships, the free Apple Declared Age Range API / Google Play Age Signals API add a second, no-cost layer satisfying US app-store age laws (Texas/Utah/Louisiana) — not applicable to the website-only phase.

## Open questions (not decided by the interview — resolved in ENGINEERING_SPEC.md where a build needs an answer, otherwise still open)

- Content moderation pipeline for uploaded audio/video.
- Monetization / business model.
- The full curated prompt bank content.
- Data retention policy specifics for stored clips (GDPR/UK-DPA).
- In-app reporting flow for post-date safety incidents, distinct from pre-match Escape.

## Reference

Full visual writeup with diagrams: `https://claude.ai/code/artifact/db994eb1-f246-4a3a-92f4-8cb4e00e4970` (private artifact, owned by the product owner).
