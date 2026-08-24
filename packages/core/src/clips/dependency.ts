// SPEC.md §2: "Upload dependency is a strict chain, enforced server-side:
// you cannot record clip N+1 until clip N exists." ENGINEERING_SPEC §4:
// "reject a tier-N upload if tier N-1 doesn't exist for that user (except
// tier 1, which has no dependency)."
import type { ClipTier } from "./tiers";
import type { ClipValidationResult } from "./validation-result";

/**
 * Pure predicate: given the set of tiers a user has *already* uploaded,
 * would uploading `tier` violate the sequential chain? Takes plain tier
 * numbers rather than a database handle so it's testable without a DB and
 * reusable by the eventual mobile port (§15) — the actual "what tiers does
 * this user have" lookup lives in packages/db (queries/clips.ts).
 */
export function checkTierDependency(
  existingTiers: readonly number[],
  tier: ClipTier,
): ClipValidationResult {
  if (tier === 1) {
    return { ok: true };
  }
  const previousTier = tier - 1;
  if (existingTiers.includes(previousTier)) {
    return { ok: true };
  }
  return {
    ok: false,
    reason: `tier ${tier} requires an existing tier ${previousTier} clip for this user first`,
  };
}
