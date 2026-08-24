// Barrel for @prompt-me/core's feed-ranking domain logic (ENGINEERING_SPEC.md
// §6, ROADMAP.md M6). Pure and dependency-free — safe to import from the
// root barrel; no client-component subpath needed since nothing here (or in
// ../location, which it depends on) touches the DOM or a `node:` import.
export {
  DENIAL_RESURFACE_HOURS,
  DENIAL_PENALTY_MULTIPLIER,
  FRESHNESS_HALF_LIFE_DAYS,
  FRESHNESS_FLOOR,
  JITTER_MAGNITUDE,
  computeFreshnessScore,
  computeBaseScore,
  isResurfaceEligible,
  needsDenialPenalty,
  computeEligibleAgainAt,
  rankFeedCandidates,
  type DenialState,
  type FeedCandidateInput,
  type RankedFeedCandidate,
} from "./ranking";
