// The M2 account-creation -> onboarding-state pipeline: given a signed-in
// account id, ensure the corresponding `users` row exists (exactly once —
// packages/db/src/queries/users.ts) and derive which onboarding step it's
// in (packages/core/src/onboarding.ts). Called on every authenticated
// request — this is the "server action on session creation" half of
// ROADMAP M2's "webhook or server action on session creation" requirement;
// the Clerk webhook (apps/web/src/app/api/webhooks/clerk) covers the
// other half, so account-creation isn't solely dependent on webhook
// delivery (which Clerk itself only guarantees best-effort).
import { onboardingStateForUser, type OnboardingState } from "@prompt-me/core";
import { ensureUserForClerkId, type AnyDb, type User } from "@prompt-me/db";

export interface OnboardingResult {
  user: User;
  state: OnboardingState;
}

export async function resolveOnboarding(db: AnyDb, clerkId: string): Promise<OnboardingResult> {
  const user = await ensureUserForClerkId(db, clerkId);
  return { user, state: onboardingStateForUser(user) };
}
