// ROADMAP.md M3's third acceptance bullet: "A user with verification_status
// != passed cannot appear in another user's feed (tested via M6 once it
// exists; stub the check here)." M6 (the discovery feed / candidate query)
// doesn't exist yet, so this is the stub the roadmap explicitly asks for —
// a pure predicate M6's real candidate query (packages/db) will call once
// it's built, tested now so the rule itself is pinned down before the feed
// query exists to enforce it.
import type { VerificationStatus } from "../onboarding";

/**
 * Whether an account may appear as a candidate in *someone else's* feed.
 * Distinct from `canAccessFeed` (onboarding.ts), which answers "can this
 * account see the feed at all" — the same underlying rule
 * (verification_status === "passed"), but a different question about a
 * different user.
 */
export function isEligibleFeedCandidate(user: { verificationStatus: VerificationStatus }): boolean {
  return user.verificationStatus === "passed";
}
