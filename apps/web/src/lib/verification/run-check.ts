// The composition point ROADMAP.md M3 actually runs: gets whichever
// VerificationProvider is active (dev-mock or real Didit — @prompt-me/core),
// calls it with the captured frame, derives the account-level pass/fail,
// and persists only the result (@prompt-me/db) — mirroring how
// apps/web/src/lib/auth/onboarding.ts composes @prompt-me/core +
// @prompt-me/db for the M2 account-creation flow.
//
// `input.selfieFrame` (and `input.clipFaceSamples`) live only in this
// function's call stack: they're read by `provider.check()` and then
// discarded — `recordVerificationCheck` is never passed them, only the
// already-computed output (ENGINEERING_SPEC §3's "processed in-memory and
// discarded" compliance default). See run-check.test.ts for the test that
// actually proves this rather than just asserting it in a comment.
import { deriveOverallVerificationStatus, getVerificationProvider, type VerificationCheckInput } from "@prompt-me/core";
import { recordVerificationCheck, type AnyDb } from "@prompt-me/db";

export interface RunVerificationCheckResult {
  status: "passed" | "failed";
  confidence: number;
}

export async function runVerificationCheck(
  db: AnyDb,
  userId: string,
  input: VerificationCheckInput,
): Promise<RunVerificationCheckResult> {
  const provider = getVerificationProvider();
  const output = await provider.check(input);
  const status = deriveOverallVerificationStatus(output);

  await recordVerificationCheck(
    db,
    userId,
    {
      livenessResult: output.livenessResult,
      ageEstimateResult: output.ageEstimateResult,
      confidence: output.confidence,
    },
    status,
  );

  return { status, confidence: output.confidence };
}
