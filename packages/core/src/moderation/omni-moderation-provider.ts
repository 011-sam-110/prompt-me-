// ENGINEERING_SPEC §1: "Moderation: OpenAI `omni-moderation-latest`
// (accepts both text and image input in one call)." No live OpenAI key
// exists yet (ROADMAP.md → Needs from Sampo), so this has never run
// against OpenAI's actual service — same "best-effort placeholder, treat
// as provisional" caveat as verification/didit-provider.ts's and
// ../transcription/whisper-provider.ts's top comments.
import type { ModerationCategoryResult, ModerationCheckOutput, ModerationInput, ModerationProvider } from "./types";

export const DEFAULT_OMNI_MODERATION_API_BASE_URL = "https://api.openai.com";
export const OMNI_MODERATION_MODEL = "omni-moderation-latest";

export interface OpenAiOmniModerationProviderConfig {
  apiKey: string;
  /** Override for tests / self-hosted proxies. Defaults to OpenAI's production API. */
  baseUrl?: string;
}

interface OmniModerationResponseBody {
  results: Array<{
    flagged: boolean;
    categories: Record<string, boolean>;
    category_scores: Record<string, number>;
  }>;
}

function isOmniModerationResponseBody(value: unknown): value is OmniModerationResponseBody {
  if (typeof value !== "object" || value === null) return false;
  const results = (value as Record<string, unknown>).results;
  if (!Array.isArray(results) || results.length === 0) return false;
  const [first] = results;
  return (
    typeof first === "object" &&
    first !== null &&
    typeof (first as Record<string, unknown>).flagged === "boolean" &&
    typeof (first as Record<string, unknown>).categories === "object" &&
    typeof (first as Record<string, unknown>).category_scores === "object"
  );
}

export class OpenAiOmniModerationProvider implements ModerationProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(config: OpenAiOmniModerationProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? DEFAULT_OMNI_MODERATION_API_BASE_URL;
  }

  async moderate(input: ModerationInput): Promise<ModerationCheckOutput> {
    const item =
      input.type === "text"
        ? { type: "text", text: input.text }
        : { type: "image_url", image_url: { url: input.imageDataUrl } };

    const response = await fetch(`${this.baseUrl}/v1/moderations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: OMNI_MODERATION_MODEL, input: [item] }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI omni-moderation check failed: ${response.status} ${response.statusText}`);
    }

    const body: unknown = await response.json();
    if (!isOmniModerationResponseBody(body)) {
      throw new Error("OpenAI omni-moderation check returned an unexpected response shape");
    }

    const [result] = body.results;
    const categories: ModerationCategoryResult[] = Object.entries(result!.categories).map(
      ([category, flagged]) => ({
        category,
        flagged,
        score: result!.category_scores[category] ?? 0,
      }),
    );

    return { flagged: result!.flagged, categories };
  }
}
