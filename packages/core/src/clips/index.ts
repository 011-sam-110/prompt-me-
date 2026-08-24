// Barrel for @prompt-me/core's clip-upload domain logic (ENGINEERING_SPEC.md
// §4, ROADMAP.md M4).
export {
  CLIP_TIERS,
  CLIP_TIER_SPECS,
  CLIP_DURATION_TOLERANCE_SECONDS,
  isValidClipTier,
  isDurationWithinTolerance,
  type ClipTier,
  type ClipFormat,
  type ClipTierSpec,
} from "./tiers";
export { checkTierDependency } from "./dependency";
export type { ClipValidationResult } from "./validation-result";
export {
  validatePromptSelection,
  type PromptSelectionInput,
  type ResolvedPromptForValidation,
} from "./prompt-selection";
export { probeClipDurationSeconds, ClipDurationProbeError } from "./duration-probe";
export {
  COMPLETION_POSITION_TOLERANCE_SECONDS,
  SCROLL_LOCK_SECONDS,
  hasReachedClipEnd,
  hasClearedScrollLock,
  clampSeekTarget,
  maxUnlockedClipIndex,
  clampLateralIndex,
} from "./playback";
export { sniffMediaContentType } from "./media-content-type";
