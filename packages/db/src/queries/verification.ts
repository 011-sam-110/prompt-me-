// ROADMAP.md M3 / ENGINEERING_SPEC.md §3: writes a verification check's
// *result* to `verification_records` and applies it to the account-level
// `users.verification_status` gate — never a raw selfie/clip frame.
//
// `result` below is typed with only the three columns verification_records
// actually has (liveness/age-estimate results + confidence) — there is no
// field this function could even accept a frame through. The insert also
// builds its values object naming each field explicitly rather than
// spreading `...result`, so an extra property tacked onto a caller's result
// object (e.g. a debug field someone added upstream) can't silently ride
// along into a row either — see apps/web/src/lib/verification/run-check.ts
// for the caller that keeps the raw frame from ever reaching this far.
import { eq } from "drizzle-orm";
import { users, type User } from "../schema/users";
import { verificationRecords, type VerificationRecord } from "../schema/verification";
import type { AnyDb } from "../types";

export interface VerificationCheckResultInput {
  livenessResult: "pass" | "fail";
  ageEstimateResult: "pass" | "fail";
  confidence: number;
}

export interface RecordVerificationCheckResult {
  record: VerificationRecord;
  user: User;
}

/**
 * Inserts one `verification_records` row for this check, then applies
 * `overallStatus` to `users.verification_status` — the field
 * ENGINEERING_SPEC §3 gates feed visibility on. Both writes happen for
 * every call (a `verification_records` row is kept even for a failing
 * check — it's the audit trail of every attempt, not just successful
 * ones).
 */
export async function recordVerificationCheck(
  db: AnyDb,
  userId: string,
  result: VerificationCheckResultInput,
  overallStatus: "passed" | "failed",
): Promise<RecordVerificationCheckResult> {
  const [record] = await db
    .insert(verificationRecords)
    .values({
      userId,
      livenessResult: result.livenessResult,
      ageEstimateResult: result.ageEstimateResult,
      confidence: result.confidence,
    })
    .returning();

  if (!record) {
    throw new Error(`recordVerificationCheck: insert returned no row for userId=${userId}`);
  }

  const [user] = await db
    .update(users)
    .set({ verificationStatus: overallStatus, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();

  if (!user) {
    throw new Error(`recordVerificationCheck: no users row found for userId=${userId}`);
  }

  return { record, user };
}
