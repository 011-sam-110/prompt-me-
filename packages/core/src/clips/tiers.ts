// Clip tier configuration — SPEC.md §2's table ("The four clips"),
// ENGINEERING_SPEC.md §4.
//
// Framework/DB-free by design (mirrors verification/types.ts's rationale):
// pure constants + predicates the eventual mobile port (§15) can reuse
// unchanged, and the one place both the upload endpoint (apps/web) and any
// future recording UI read tier facts from, so "15s/30s/2min/3min" is
// spelled out exactly once.
export type ClipTier = 1 | 2 | 3 | 4;

export const CLIP_TIERS: readonly ClipTier[] = [1, 2, 3, 4];

/** SPEC.md §2's "Format" column. */
export type ClipFormat = "audio" | "video";

export interface ClipTierSpec {
  tier: ClipTier;
  /** Fixed target length for this tier, in seconds. */
  durationSeconds: number;
  format: ClipFormat;
  /** Only tier 1 is mandatory (SPEC.md §2). */
  required: boolean;
}

export const CLIP_TIER_SPECS: Readonly<Record<ClipTier, ClipTierSpec>> = {
  1: { tier: 1, durationSeconds: 15, format: "audio", required: true },
  2: { tier: 2, durationSeconds: 30, format: "video", required: false },
  3: { tier: 3, durationSeconds: 120, format: "video", required: false },
  4: { tier: 4, durationSeconds: 180, format: "video", required: false },
};

/**
 * ENGINEERING_SPEC §4: "with a small tolerance, e.g. ±0.5s". Named as its
 * own constant (rather than an inline literal at every call site) so a
 * future revision of the tolerance is a one-line change.
 */
export const CLIP_DURATION_TOLERANCE_SECONDS = 0.5;

export function isValidClipTier(value: number): value is ClipTier {
  return value === 1 || value === 2 || value === 3 || value === 4;
}

/**
 * ENGINEERING_SPEC §4: "Duration is validated server-side against the
 * tier's fixed length... never trust client-reported duration." This
 * function is the tolerance check itself — callers must feed it a duration
 * that was actually *measured* server-side (see duration-probe.ts), not a
 * client-supplied number, or this check is meaningless.
 */
export function isDurationWithinTolerance(tier: ClipTier, durationSeconds: number): boolean {
  const target = CLIP_TIER_SPECS[tier].durationSeconds;
  return Math.abs(durationSeconds - target) <= CLIP_DURATION_TOLERANCE_SECONDS;
}
