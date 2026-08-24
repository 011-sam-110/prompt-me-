// Barrel for @prompt-me/core's verification adapter (ENGINEERING_SPEC.md
// §3, ROADMAP.md M3).
export type {
  VerificationCheckResult,
  VerificationCheckInput,
  VerificationCheckOutput,
  VerificationProvider,
} from "./types";
export { DevMockVerificationProvider, DEV_MOCK_VERIFICATION_CONFIDENCE } from "./dev-mock-provider";
export {
  DiditVerificationProvider,
  DEFAULT_DIDIT_API_BASE_URL,
  type DiditVerificationProviderConfig,
} from "./didit-provider";
export { isDiditConfigured } from "./config";
export { getVerificationProvider } from "./get-provider";
export { deriveOverallVerificationStatus, type OverallVerificationStatus } from "./status";
export { isEligibleFeedCandidate } from "./eligibility";
