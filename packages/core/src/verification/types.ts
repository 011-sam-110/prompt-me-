// ENGINEERING_SPEC.md §3: "Adapter: `VerificationProvider.check(selfieFrame,
// clipFaceSamples) → { livenessResult, ageEstimate, confidence }`." Field
// names below match packages/db's verification_records columns
// (livenessResult / ageEstimateResult / confidence) rather than the spec
// prose's shorthand ("ageEstimate"), so a provider's output can be handed
// straight to the query layer with no renaming step.
//
// Framework/DB-free by design (mirrors onboarding.ts's rationale): this
// interface is the seam the eventual mobile port (§15) would reuse if it
// ever needed to run a check client-side, though today only apps/web's
// server-side flow calls it.

/** Outcome of a single liveness or age-estimate sub-check. */
export type VerificationCheckResult = "pass" | "fail";

/**
 * Input to a verification check. Both fields are held in memory only for
 * the duration of the call — ENGINEERING_SPEC §3's compliance default
 * ("processed in-memory and discarded... only the boolean result +
 * confidence score is persisted") is enforced by construction: nothing in
 * this package, or in packages/db's query layer, ever writes a frame to
 * storage — see packages/db/src/queries/verification.ts's comment.
 */
export interface VerificationCheckInput {
  /** A single captured selfie frame, as a base64 data URL. */
  selfieFrame: string;
  /**
   * Sampled frames from the user's own uploaded clips (M4), for a
   * face-match against the selfie. Always an empty array before M4 exists
   * — the adapter contract accepts it now so M4 doesn't need to change
   * this interface later, but nothing before M4 has real samples to pass.
   */
  clipFaceSamples: string[];
}

export interface VerificationCheckOutput {
  livenessResult: VerificationCheckResult;
  ageEstimateResult: VerificationCheckResult;
  /** 0.0-1.0 confidence score, persisted as-is to verification_records. */
  confidence: number;
}

/** ENGINEERING_SPEC §3's adapter interface. Two implementations: a
 * deterministic dev-mock (dev-mock-provider.ts) and a real Didit-backed
 * one (didit-provider.ts) — selected by get-provider.ts based on whether
 * a Didit API key is configured (config.ts). */
export interface VerificationProvider {
  check(input: VerificationCheckInput): Promise<VerificationCheckOutput>;
}
