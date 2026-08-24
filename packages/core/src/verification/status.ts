// Turns a provider's two sub-check results into the single account-level
// `users.verification_status` value ENGINEERING_SPEC §3 gates the feed on
// ("A profile cannot go live... until verification_status = passed").
import type { VerificationCheckOutput } from "./types";

export type OverallVerificationStatus = "passed" | "failed";

/**
 * "passed" requires both the liveness check and the age-estimate check to
 * individually pass — ENGINEERING_SPEC §3 doesn't spell out the boolean
 * combination explicitly, but a liveness *or* an age-estimate failure are
 * both independently disqualifying (a spoofed/non-live selfie, or an
 * under-age estimate), so either one failing fails the whole check. This
 * is an engineering default, same category as the other calls this repo
 * flags inline rather than silently assuming.
 */
export function deriveOverallVerificationStatus(
  output: VerificationCheckOutput,
): OverallVerificationStatus {
  const passed = output.livenessResult === "pass" && output.ageEstimateResult === "pass";
  return passed ? "passed" : "failed";
}
