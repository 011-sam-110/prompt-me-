// Barrel for @prompt-me/core's date-idea generator adapter
// (ENGINEERING_SPEC.md §10, ROADMAP.md M10).
export type { GeneratedIdea, DateIdeaGeneratorInput, DateIdeaGeneratorOutput, DateIdeaGeneratorProvider } from "./types";
export { isAnthropicConfigured } from "./config";
export { DevMockDateIdeaGeneratorProvider, DEV_MOCK_DATE_IDEAS } from "./dev-mock-provider";
export {
  ClaudeDateIdeaGeneratorProvider,
  CLAUDE_DATE_IDEAS_MODEL,
  SUBMIT_DATE_IDEAS_TOOL_NAME,
  type ClaudeDateIdeaGeneratorProviderConfig,
} from "./claude-provider";
export { getDateIdeaGeneratorProvider } from "./get-provider";
