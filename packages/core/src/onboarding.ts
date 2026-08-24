// The M2 onboarding gate — ENGINEERING_SPEC.md §3: "A profile cannot go
// live (appear in any other user's feed) until verification_status =
// passed." ROADMAP.md M2: "Onboarding shell routes an unverified user
// toward verification (M3) and blocks feed access until
// verification_status = passed."
//
// `VerificationStatus` mirrors packages/db's `user_verification_status`
// enum (pending/passed/failed) by value, but is declared independently
// here rather than imported from `@prompt-me/db` — this package is meant
// to be framework/DB-free domain logic reusable by the eventual mobile
// port through a thin API client (ENGINEERING_SPEC.md §1, §15), so it
// shouldn't depend on a Drizzle schema module at all.
export type VerificationStatus = "pending" | "passed" | "failed";

/**
 * Where a user sits in the M2 onboarding flow, derived purely from their
 * account's verification status:
 *  - "needs_verification": never attempted, or mid-flow — route to M3.
 *  - "verification_failed": M3's check ran and did not pass — a distinct
 *    state (not just "needs_verification" again) so the UI can offer a
 *    retry message instead of a first-time prompt.
 *  - "active": verification passed — the feed (M6) is unlocked.
 */
export type OnboardingState = "needs_verification" | "verification_failed" | "active";

/** Derives the onboarding state for a user from their verification status. */
export function onboardingStateForUser(user: {
  verificationStatus: VerificationStatus;
}): OnboardingState {
  switch (user.verificationStatus) {
    case "passed":
      return "active";
    case "failed":
      return "verification_failed";
    case "pending":
      return "needs_verification";
  }
}

/** Whether this onboarding state may see the discovery feed (M6) at all. */
export function canAccessFeed(state: OnboardingState): boolean {
  return state === "active";
}
