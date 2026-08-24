// Barrel export for @prompt-me/core.
//
// Real modules (match/date state machine, feed-ranking logic, shared
// domain types — ENGINEERING_SPEC.md §1) are added milestone by milestone.
// `scaffold.ts` is a placeholder that exists only for M1's build gate.
export { ping } from "./scaffold";
export {
  onboardingStateForUser,
  canAccessFeed,
  type VerificationStatus,
  type OnboardingState,
} from "./onboarding";
export * from "./verification";
