import { describe, expect, it } from "vitest";
import { encodeGeohash } from "../location/geohash";
import {
  DENIAL_PENALTY_MULTIPLIER,
  DENIAL_RESURFACE_HOURS,
  FRESHNESS_FLOOR,
  computeBaseScore,
  computeEligibleAgainAt,
  computeFreshnessScore,
  isResurfaceEligible,
  needsDenialPenalty,
  rankFeedCandidates,
  type DenialState,
  type FeedCandidateInput,
} from "./ranking";

const NOW = new Date("2026-08-24T12:00:00.000Z");
const HOUR_MS = 60 * 60 * 1000;

describe("computeFreshnessScore", () => {
  it("is 1 for a profile created exactly now", () => {
    expect(computeFreshnessScore(NOW, NOW)).toBeCloseTo(1, 9);
  });

  it("decays toward, but never below, the floor for a very old profile", () => {
    const veryOld = new Date(NOW.getTime() - 365 * 24 * HOUR_MS);
    const score = computeFreshnessScore(veryOld, NOW);
    expect(score).toBeGreaterThan(FRESHNESS_FLOOR);
    expect(score).toBeCloseTo(FRESHNESS_FLOOR, 2);
  });

  it("sits exactly halfway between 1 and the floor at one half-life", () => {
    const oneHalfLifeAgo = new Date(NOW.getTime() - 14 * 24 * HOUR_MS);
    const score = computeFreshnessScore(oneHalfLifeAgo, NOW);
    expect(score).toBeCloseTo(FRESHNESS_FLOOR + (1 - FRESHNESS_FLOOR) * 0.5, 6);
  });

  it("clamps a createdAt after now to age 0 rather than exceeding 1", () => {
    const future = new Date(NOW.getTime() + HOUR_MS);
    expect(computeFreshnessScore(future, NOW)).toBeCloseTo(1, 9);
  });
});

describe("computeBaseScore", () => {
  it("adds symmetric jitter around freshness, driven entirely by the injected random function", () => {
    const scoreAtMaxJitter = computeBaseScore(NOW, NOW, () => 1);
    const scoreAtMinJitter = computeBaseScore(NOW, NOW, () => 0);
    const scoreAtNoJitter = computeBaseScore(NOW, NOW, () => 0.5);

    expect(scoreAtNoJitter).toBeCloseTo(1, 9); // freshness(NOW, NOW) === 1, jitter 0
    expect(scoreAtMaxJitter).toBeGreaterThan(scoreAtNoJitter);
    expect(scoreAtMinJitter).toBeLessThan(scoreAtNoJitter);
  });

  it("is deterministic for a fixed randomFn — no ambient randomness leaks in", () => {
    const a = computeBaseScore(NOW, NOW, () => 0.7);
    const b = computeBaseScore(NOW, NOW, () => 0.7);
    expect(a).toBe(b);
  });
});

describe("48h resurfacing — isResurfaceEligible / needsDenialPenalty, mocked clock", () => {
  it("a profile with no denial history is always eligible and never penalized", () => {
    expect(isResurfaceEligible(null, NOW)).toBe(true);
    expect(needsDenialPenalty(null, NOW)).toBe(false);
  });

  it("stays excluded partway through the 48h window", () => {
    const decidedAt = new Date(NOW.getTime() - 1 * HOUR_MS);
    const denial: DenialState = { decidedAt, eligibleAgainAt: computeEligibleAgainAt(decidedAt) };

    expect(isResurfaceEligible(denial, NOW)).toBe(false);
    expect(needsDenialPenalty(denial, NOW)).toBe(false);
  });

  it("stays excluded one millisecond before the 48h boundary", () => {
    const decidedAt = new Date(NOW.getTime() - DENIAL_RESURFACE_HOURS * HOUR_MS + 1);
    const denial: DenialState = { decidedAt, eligibleAgainAt: computeEligibleAgainAt(decidedAt) };

    expect(isResurfaceEligible(denial, NOW)).toBe(false);
  });

  it("becomes eligible, with the penalty applying, at exactly the 48h boundary", () => {
    const decidedAt = new Date(NOW.getTime() - DENIAL_RESURFACE_HOURS * HOUR_MS);
    const denial: DenialState = { decidedAt, eligibleAgainAt: computeEligibleAgainAt(decidedAt) };

    expect(isResurfaceEligible(denial, NOW)).toBe(true);
    expect(needsDenialPenalty(denial, NOW)).toBe(true);
  });

  it("stays eligible, with the penalty, well past the 48h window", () => {
    const decidedAt = new Date(NOW.getTime() - 100 * HOUR_MS);
    const denial: DenialState = { decidedAt, eligibleAgainAt: computeEligibleAgainAt(decidedAt) };

    expect(isResurfaceEligible(denial, NOW)).toBe(true);
    expect(needsDenialPenalty(denial, NOW)).toBe(true);
  });

  it("fails open (eligible, not penalized-and-thrown) for a denial row with a null eligibleAgainAt", () => {
    const denial: DenialState = { decidedAt: NOW, eligibleAgainAt: null };
    expect(isResurfaceEligible(denial, NOW)).toBe(true);
  });
});

describe("computeEligibleAgainAt", () => {
  it("is decidedAt + 48 hours, using DENIAL_RESURFACE_HOURS rather than a duplicated literal", () => {
    const decidedAt = new Date("2026-08-01T00:00:00.000Z");
    expect(computeEligibleAgainAt(decidedAt).getTime()).toBe(
      decidedAt.getTime() + DENIAL_RESURFACE_HOURS * HOUR_MS,
    );
    expect(computeEligibleAgainAt(decidedAt).toISOString()).toBe("2026-08-03T00:00:00.000Z");
  });
});

describe("rankFeedCandidates", () => {
  const viewerGeohash5 = encodeGeohash(51.5074, -0.1278, 5); // London
  const nearGeohash5 = viewerGeohash5; // same cell — distance 0
  const farGeohash5 = encodeGeohash(-33.8688, 151.2093, 5); // Sydney — nowhere near London

  const noJitter = () => 0.5; // computeBaseScore's jitter term becomes exactly 0

  it("filters out a candidate outside radiusKm", () => {
    const candidates: FeedCandidateInput[] = [
      { userId: "near", geohash5: nearGeohash5, createdAt: NOW, latestDenial: null },
      { userId: "far", geohash5: farGeohash5, createdAt: NOW, latestDenial: null },
    ];

    const ranked = rankFeedCandidates(candidates, viewerGeohash5, 500, NOW, noJitter);
    expect(ranked.map((r) => r.userId)).toEqual(["near"]);
  });

  it("filters out a candidate still inside their 48h denial window", () => {
    const decidedAt = new Date(NOW.getTime() - 1 * HOUR_MS);
    const candidates: FeedCandidateInput[] = [
      {
        userId: "denied-recent",
        geohash5: nearGeohash5,
        createdAt: NOW,
        latestDenial: { decidedAt, eligibleAgainAt: computeEligibleAgainAt(decidedAt) },
      },
      { userId: "clean", geohash5: nearGeohash5, createdAt: NOW, latestDenial: null },
    ];

    const ranked = rankFeedCandidates(candidates, viewerGeohash5, 500, NOW, noJitter);
    expect(ranked.map((r) => r.userId)).toEqual(["clean"]);
  });

  it("resurfaces a candidate past their 48h window at exactly a 0.3x score penalty", () => {
    const decidedAt = new Date(NOW.getTime() - 49 * HOUR_MS);
    const candidates: FeedCandidateInput[] = [
      {
        userId: "denied-old",
        geohash5: nearGeohash5,
        createdAt: NOW,
        latestDenial: { decidedAt, eligibleAgainAt: computeEligibleAgainAt(decidedAt) },
      },
      { userId: "clean", geohash5: nearGeohash5, createdAt: NOW, latestDenial: null },
    ];

    // Same createdAt + no jitter => identical base score for both, so the
    // only difference between their final scores is the penalty itself.
    const ranked = rankFeedCandidates(candidates, viewerGeohash5, 500, NOW, noJitter);
    const denied = ranked.find((r) => r.userId === "denied-old")!;
    const clean = ranked.find((r) => r.userId === "clean")!;

    expect(denied.score).toBeCloseTo(clean.score * DENIAL_PENALTY_MULTIPLIER, 9);
    expect(ranked.map((r) => r.userId)).toEqual(["clean", "denied-old"]); // still ranked, just lower
  });

  it("sorts highest score first", () => {
    const candidates: FeedCandidateInput[] = [
      {
        userId: "old",
        geohash5: nearGeohash5,
        createdAt: new Date(NOW.getTime() - 365 * 24 * HOUR_MS),
        latestDenial: null,
      },
      { userId: "new", geohash5: nearGeohash5, createdAt: NOW, latestDenial: null },
    ];

    const ranked = rankFeedCandidates(candidates, viewerGeohash5, 500, NOW, noJitter);
    expect(ranked.map((r) => r.userId)).toEqual(["new", "old"]);
  });
});
