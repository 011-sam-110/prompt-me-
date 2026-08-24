// ENGINEERING_SPEC §1: "Transcription: OpenAI Whisper API (server-side, on
// clip upload)." Real implementation, selected automatically once
// OPENAI_API_KEY is configured (config.ts / get-provider.ts) — no real key
// exists yet (ROADMAP.md → Needs from Sampo), so this has never run
// against OpenAI's actual service. The request shape below is a
// best-effort build from Whisper's publicly documented multipart
// transcription endpoint, not something verified against a real account —
// same caveat as verification/didit-provider.ts's top comment, applied to
// OpenAI instead of Didit: treat it as provisional and confirm against
// OpenAI's own docs once a real key exists and this can be exercised for
// real.
import type { TranscriptionInput, TranscriptionOutput, TranscriptionProvider } from "./types";

export const DEFAULT_OPENAI_API_BASE_URL = "https://api.openai.com";
export const WHISPER_MODEL = "whisper-1";

export interface OpenAiWhisperTranscriptionProviderConfig {
  apiKey: string;
  /** Override for tests / self-hosted proxies. Defaults to OpenAI's production API. */
  baseUrl?: string;
}

interface WhisperResponseBody {
  text: string;
}

function isWhisperResponseBody(value: unknown): value is WhisperResponseBody {
  return typeof value === "object" && value !== null && typeof (value as Record<string, unknown>).text === "string";
}

/**
 * Whisper's multipart endpoint infers the container/codec from the
 * uploaded part's *filename* extension, not its declared Content-Type —
 * this turns a clip's mimeType (e.g. "audio/webm") into a plausible
 * filename ("clip.webm") rather than guessing a hardcoded extension.
 */
function filenameForMimeType(mimeType: string): string {
  const subtype = mimeType.split("/")[1]?.split(";")[0];
  return `clip.${subtype && subtype.length > 0 ? subtype : "webm"}`;
}

export class OpenAiWhisperTranscriptionProvider implements TranscriptionProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(config: OpenAiWhisperTranscriptionProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? DEFAULT_OPENAI_API_BASE_URL;
  }

  async transcribe(input: TranscriptionInput): Promise<TranscriptionOutput> {
    const form = new FormData();
    form.append("model", WHISPER_MODEL);
    // `input.data` is typed Uint8Array<ArrayBufferLike> — its backing
    // buffer *could* be a SharedArrayBuffer as far as the type system
    // knows, which lib.dom.d.ts's BlobPart (ArrayBufferView<ArrayBuffer>)
    // won't accept. `new Uint8Array(input.data)` copies into a fresh,
    // definitely-ArrayBuffer-backed view — a small real copy (clips are at
    // most a few MB), not the zero-copy Buffer.from(...) trick
    // storage/vercel-blob-storage-adapter.ts uses for @vercel/blob's more
    // loosely-typed `body` parameter.
    const bytes = new Uint8Array(input.data);
    form.append("file", new Blob([bytes], { type: input.mimeType }), filenameForMimeType(input.mimeType));

    const response = await fetch(`${this.baseUrl}/v1/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}` },
      // No explicit Content-Type header: letting fetch set the multipart
      // boundary itself from the FormData body is the only correct way to
      // do this (a hand-set header here would omit the boundary param and
      // the request would fail to parse server-side).
      body: form,
    });

    if (!response.ok) {
      throw new Error(`OpenAI Whisper transcription failed: ${response.status} ${response.statusText}`);
    }

    const body: unknown = await response.json();
    if (!isWhisperResponseBody(body)) {
      throw new Error("OpenAI Whisper transcription returned an unexpected response shape");
    }

    return { transcript: body.text };
  }
}
