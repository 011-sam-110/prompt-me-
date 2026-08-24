// Barrel for @prompt-me/core's moderation adapter (ENGINEERING_SPEC.md
// §1/§12, ROADMAP.md M4/M12).
export type {
  ModerationInput,
  ModerationCategoryResult,
  ModerationCheckOutput,
  ModerationProvider,
} from "./types";
export { isOpenAiModerationConfigured } from "./config";
export { DevMockModerationProvider } from "./dev-mock-provider";
export {
  OpenAiOmniModerationProvider,
  DEFAULT_OMNI_MODERATION_API_BASE_URL,
  OMNI_MODERATION_MODEL,
  type OpenAiOmniModerationProviderConfig,
} from "./omni-moderation-provider";
export { getModerationProvider } from "./get-provider";
