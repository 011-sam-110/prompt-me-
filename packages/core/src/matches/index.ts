// Barrel for @prompt-me/core's match-detection domain logic
// (ENGINEERING_SPEC.md §7, ROADMAP.md M7). Pure and dependency-free, same
// as ../feed — no DB handle, no timestamp, nothing to mock.
export { hasCompletedAllClips } from "./mutual-completion";
export { canonicalizeMatchPair, type CanonicalMatchPair } from "./pair-order";
export {
  canTransition,
  isEscapeEligible,
  transition,
  IllegalMatchTransitionError,
  ESCAPE_ELIGIBLE_STATES,
  MATCH_LIFECYCLE_EDGES,
  MATCH_LIFECYCLE_STATES,
  type MatchLifecycleState,
  type MatchLifecycleEdge,
} from "./lifecycle";
