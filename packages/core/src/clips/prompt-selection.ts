// SPEC.md §2: "Each tier offers a shortlist of 3 curated prompts to choose
// from, plus a free-text option to write your own." Mirrors
// packages/db/src/schema/clips.ts's `clips_prompt_source_xor` CHECK
// constraint at the application layer — this runs *before* the insert so
// an invalid submission gets a clear, typed reason instead of a raw
// Postgres constraint-violation error (the DB constraint is the backstop,
// this is the actual validation).
import type { ClipTier } from "./tiers";
import type { ClipValidationResult } from "./validation-result";

/** The subset of a `prompts` row this validator actually needs — passed in
 * already-fetched (packages/db does the lookup) so this stays DB-free. */
export interface ResolvedPromptForValidation {
  tier: number;
  isActive: boolean;
}

export interface PromptSelectionInput {
  tier: ClipTier;
  promptId?: string | null;
  customPromptText?: string | null;
  /**
   * The `prompts` row `promptId` refers to, already loaded by the caller —
   * `null`/`undefined` both mean "no such prompt was found" (including
   * when `promptId` itself was never given).
   */
  resolvedPrompt?: ResolvedPromptForValidation | null;
}

// Engineering default, not spec'd anywhere: a sanity cap so a custom
// prompt stays a short spoken-prompt line rather than a pasted essay.
// Revisit if real usage needs something different.
const MAX_CUSTOM_PROMPT_LENGTH = 280;

/**
 * Exactly one of `promptId` / `customPromptText` (SPEC.md §2's "curated...
 * plus a free-text option" — never both, never neither, matching the DB's
 * XOR check). A given `promptId` must resolve to an *active* prompt
 * belonging to the *same tier* being uploaded — picking tier 2's prompt
 * list but submitting a tier 3 clip is rejected here, not left to the DB's
 * FK (which has no opinion on tier matching).
 */
export function validatePromptSelection(input: PromptSelectionInput): ClipValidationResult {
  const hasPromptId = Boolean(input.promptId);
  const trimmedCustomText = input.customPromptText?.trim() ?? "";
  const hasCustomText = trimmedCustomText.length > 0;

  if (hasPromptId === hasCustomText) {
    return {
      ok: false,
      reason: "exactly one of promptId or customPromptText is required",
    };
  }

  if (hasPromptId) {
    if (!input.resolvedPrompt) {
      return { ok: false, reason: "promptId does not reference an existing prompt" };
    }
    if (!input.resolvedPrompt.isActive) {
      return { ok: false, reason: "promptId refers to a retired (inactive) prompt" };
    }
    if (input.resolvedPrompt.tier !== input.tier) {
      return {
        ok: false,
        reason: `promptId belongs to tier ${input.resolvedPrompt.tier}, not tier ${input.tier}`,
      };
    }
    return { ok: true };
  }

  if (trimmedCustomText.length > MAX_CUSTOM_PROMPT_LENGTH) {
    return {
      ok: false,
      reason: `customPromptText exceeds ${MAX_CUSTOM_PROMPT_LENGTH} characters`,
    };
  }

  return { ok: true };
}
