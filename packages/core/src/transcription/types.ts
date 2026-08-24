// ENGINEERING_SPEC.md §1/§4: "Transcription: OpenAI Whisper API
// (server-side, on clip upload)." Adapter shape mirrors
// verification/types.ts exactly — one small interface, a deterministic
// dev-mock, a real implementation, and a config-based selector
// (get-provider.ts).
//
// Framework/DB-free by design, same rationale as verification/types.ts:
// the seam the eventual mobile port (§15) would reuse if it ever needed a
// server-side transcription call from a different client.

export interface TranscriptionInput {
  /** Raw bytes of the uploaded clip (audio- or video-tier — Whisper reads
   * the audio track out of either container itself; nothing in this
   * package extracts audio-only bytes first). */
  data: Uint8Array;
  /** The clip's content type — used as a multipart filename hint for
   * whichever provider needs to guess a container/codec (see
   * whisper-provider.ts's filenameForMimeType). */
  mimeType: string;
}

export interface TranscriptionOutput {
  transcript: string;
}

/** ENGINEERING_SPEC §4's adapter: two implementations — a deterministic
 * dev-mock (dev-mock-provider.ts) and a real Whisper-backed one
 * (whisper-provider.ts) — selected by get-provider.ts based on whether an
 * OpenAI API key is configured (config.ts). */
export interface TranscriptionProvider {
  transcribe(input: TranscriptionInput): Promise<TranscriptionOutput>;
}
