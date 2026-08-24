"use server";
// Server action backing the selfie-capture UI
// (components/verification/selfie-capture.tsx). Resolves who's signed in,
// ensures their `users` row exists (same exactly-once guarantee M2's
// resolveOnboarding relies on), then runs the check.
import { redirect } from "next/navigation";
import { ensureUserForClerkId } from "@prompt-me/db";
import { getAppDb } from "@/lib/db";
import { getAuthSession } from "@/lib/auth/session";
import { runVerificationCheck, type RunVerificationCheckResult } from "./run-check";

export async function submitVerificationCheck(
  selfieFrame: string,
): Promise<RunVerificationCheckResult> {
  const { clerkId } = await getAuthSession();
  if (!clerkId) {
    redirect("/sign-in");
  }

  const db = await getAppDb();
  const user = await ensureUserForClerkId(db, clerkId);

  // clipFaceSamples is always empty before M4 (clip upload) exists — see
  // packages/core/src/verification/types.ts's comment on that field.
  return runVerificationCheck(db, user.id, { selfieFrame, clipFaceSamples: [] });
}
