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
export * from "./clips";
export * from "./storage";
export * from "./transcription";
export * from "./moderation";
export * from "./frame-sampling";
export * from "./location";
export * from "./feed";
export * from "./matches";
export * from "./rewatch";
export * from "./calendar";
export * from "./places";
export * from "./date-proposals";
export * from "./date-ideas";
