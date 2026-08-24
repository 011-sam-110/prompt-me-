// Barrel for @prompt-me/core's rewatch-access domain logic
// (ENGINEERING_SPEC.md §8, ROADMAP.md M8). Pure and dependency-free, same
// as ../feed — no DB handle, only an explicit `now`.
export {
  REWATCH_WINDOW_MINUTES,
  REWATCH_COOLDOWN_HOURS,
  computeExpiresAt,
  computeCooldownEndsAt,
  evaluateRewatchAccess,
  type RewatchSessionSnapshot,
  type RewatchAccessDecision,
} from "./access";
