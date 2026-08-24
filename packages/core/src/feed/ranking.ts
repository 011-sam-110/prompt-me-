// Feed ranking — ENGINEERING_SPEC.md §6 "Ranking" + ROADMAP.md M6's second
// and third acceptance bullets. Pure, DB/DOM-free (mirrors clips/playback.ts's
// split): packages/db's feed.ts query fetches the otherwise-eligible
// candidate pool (self/verification/match/block exclusion + geohash — all
// mechanical WHERE-clause work), and this module turns that pool into the
// actual ranked list, given a point in time to score against. `now` (and,
// for jitter, `randomFn`) are always explicit parameters rather than read
// from the ambient clock/RNG — the same "no hidden global state" shape the
// rest of this codebase already uses for testability (e.g. clip-views.ts's
// `reachedEnd` is the only signal driving completion, never an implicit
// client boolean); it's also literally what this milestone's acceptance
// bullet asks for: "tested with time-travel/mocked clock."
//
// Two independent things are decided here, per §6:
//  1. A base score that favors freshness with randomized jitter, so no
//     profile is perpetually buried (a floor under the decay) or
//     perpetually favored (jitter breaks ties between similarly-fresh
//     profiles).
//  2. A denial-recirculation rule read from `feed_decisions`: a `denied`
//     row hides its profile entirely for 48h (`eligibleAgainAt`), then lets
//     it back in at a 0.3x score penalty — "less likely," per SPEC.md §5,
//     not gone. A `matched` row is deliberately never consulted here — the
//     hard, permanent exclusion for an active/blocked match is the
//     `matches` table's job (packages/db's feed.ts candidate query), not a
//     scoring penalty (see schema/feed-decisions.ts's own comment on the
//     same split).
import { isWithinRadiusKm } from "../location";

/**
 * "Excluded entirely from resurfacing for 48 hours" (ENGINEERING_SPEC §6).
 * Named rather than inlined so this module and any future writer of a
 * `denied` decision (M7's pass-gesture handling) share the exact same
 * number via `computeEligibleAgainAt` below.
 */
export const DENIAL_RESURFACE_HOURS = 48;

/** "...then resurfaces at the reduced weight" — the 0.3x ENGINEERING_SPEC
 * §6 spells out literally. */
export const DENIAL_PENALTY_MULTIPLIER = 0.3;

/**
 * Freshness decays on a half-life curve rather than a hard cliff, so
 * ranking degrades smoothly instead of a profile falling off a ranking
 * "edge" the day after some fixed cutoff. Engineering default (§6 flags the
 * whole ranking section as one, "revisit if it feels wrong in Round 3") —
 * two weeks is a reasonable window for a profile to still read as "new" in
 * this niche.
 */
export const FRESHNESS_HALF_LIFE_DAYS = 14;

/**
 * The floor freshness decays toward but never below — ENGINEERING_SPEC §6's
 * "so no profile is perpetually buried." An infinitely-old profile still
 * has a nonzero base score, only ever pushed further down by jitter/denial,
 * never structurally to zero.
 */
export const FRESHNESS_FLOOR = 0.2;

/**
 * Jitter amplitude added on top of freshness (ENGINEERING_SPEC §6:
 * "randomized jitter, so no profile is perpetually... favored") — large
 * enough to meaningfully reshuffle candidates whose freshness scores are
 * close, small enough that a genuinely brand-new profile still reliably
 * outranks a months-old one.
 */
export const JITTER_MAGNITUDE = 0.15;

/**
 * Freshness component of the base score: 1.0 for a profile created at
 * `now`, decaying on a half-life curve toward `FRESHNESS_FLOOR` as
 * `createdAt` recedes into the past. Never exceeds 1 and never drops below
 * the floor, regardless of how far apart `createdAt`/`now` are (including a
 * `createdAt` after `now` — clamped to age 0 rather than producing a
 * negative age / score > 1).
 */
export function computeFreshnessScore(createdAt: Date, now: Date): number {
  const ageMs = Math.max(0, now.getTime() - createdAt.getTime());
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  const decay = Math.pow(0.5, ageDays / FRESHNESS_HALF_LIFE_DAYS);
  return FRESHNESS_FLOOR + (1 - FRESHNESS_FLOOR) * decay;
}

/**
 * Base score = freshness + symmetric random jitter in
 * `[-JITTER_MAGNITUDE, +JITTER_MAGNITUDE]`. `randomFn` defaults to
 * `Math.random` but is always an explicit parameter — a test supplies a
 * fixed/sequenced one instead of stubbing the global, the same "no ambient
 * state" shape `now` gets throughout this module.
 */
export function computeBaseScore(
  createdAt: Date,
  now: Date,
  randomFn: () => number = Math.random,
): number {
  const freshness = computeFreshnessScore(createdAt, now);
  const jitter = (randomFn() * 2 - 1) * JITTER_MAGNITUDE;
  return freshness + jitter;
}

/**
 * The subset of a `feed_decisions` row that matters for resurfacing —
 * always the *most recent* `denied` row for a (viewer, profile) pair
 * (packages/db's feed.ts already reduces to that before this module ever
 * sees it; an older superseded denial has no bearing once a newer one
 * exists for the same pair). `null` means "never denied" (or denied and
 * since matched, in which case the `matches` table's hard exclusion already
 * keeps the profile out of the candidate pool before ranking ever runs).
 */
export interface DenialState {
  eligibleAgainAt: Date | null;
  decidedAt: Date;
}

/**
 * Whether a denied profile may resurface at all yet. `eligibleAgainAt` null
 * on a denied row shouldn't happen in practice (packages/db always sets it,
 * and schema/feed-decisions.ts's own comment says so) but is treated as
 * "already eligible" rather than thrown on, so a malformed/legacy row fails
 * open to "visible" instead of silently hiding a profile forever.
 */
export function isResurfaceEligible(denial: DenialState | null, now: Date): boolean {
  if (!denial || !denial.eligibleAgainAt) {
    return true;
  }
  return now.getTime() >= denial.eligibleAgainAt.getTime();
}

/**
 * Whether the 0.3x penalty applies: there's a standing denial, and it's
 * past its 48h exclusion window (a still-excluded denial never reaches
 * this in practice — `rankFeedCandidates` below filters it out first — but
 * this function stays self-contained rather than trusting call order, the
 * same defensive shape `clip-views.ts`'s monotonic-completion check uses).
 */
export function needsDenialPenalty(denial: DenialState | null, now: Date): boolean {
  return denial !== null && isResurfaceEligible(denial, now);
}

/**
 * `decidedAt + 48h` — the value a `denied` feed_decisions row's
 * `eligibleAgainAt` should be written with (M7's pass-gesture handling,
 * once it writes these rows) and what this module's own resurfacing tests
 * check against, so "48 hours" exists as one named constant
 * (`DENIAL_RESURFACE_HOURS`) rather than a duplicated magic number.
 */
export function computeEligibleAgainAt(decidedAt: Date): Date {
  return new Date(decidedAt.getTime() + DENIAL_RESURFACE_HOURS * 60 * 60 * 1000);
}

export interface FeedCandidateInput {
  userId: string;
  geohash5: string;
  createdAt: Date;
  latestDenial: DenialState | null;
}

export interface RankedFeedCandidate {
  userId: string;
  score: number;
}

/**
 * Turns the otherwise-eligible candidate pool (packages/db's
 * `getFeedCandidatesForViewer` — self/verification/match/block already
 * excluded there) into the actual ranked feed: radius filter, then the
 * 48h-exclusion / 0.3x-penalty denial rule, then freshness+jitter scoring,
 * highest score first. Every candidate not filtered out gets exactly one
 * score; ties (possible with `randomFn` stubbed to a constant) keep their
 * relative input order, per `Array.prototype.sort`'s stability guarantee.
 */
export function rankFeedCandidates(
  candidates: readonly FeedCandidateInput[],
  viewerGeohash5: string,
  radiusKm: number,
  now: Date,
  randomFn: () => number = Math.random,
): RankedFeedCandidate[] {
  return candidates
    .filter((candidate) => isWithinRadiusKm(viewerGeohash5, candidate.geohash5, radiusKm))
    .filter((candidate) => isResurfaceEligible(candidate.latestDenial, now))
    .map((candidate) => {
      const base = computeBaseScore(candidate.createdAt, now, randomFn);
      const score = needsDenialPenalty(candidate.latestDenial, now)
        ? base * DENIAL_PENALTY_MULTIPLIER
        : base;
      return { userId: candidate.userId, score };
    })
    .sort((a, b) => b.score - a.score);
}
