// The adapter that turns a computed timestamp (timestamps.ts) into an
// actual image to hand to moderation. Mirrors ../storage/types.ts's shape
// — one small interface, a genuinely-functional dev-mock, and a real
// implementation gated behind explicit configuration (config.ts).
//
// Unlike a credential-gated adapter (Didit/Whisper/omni-moderation all
// need an API key), a video decoder needs an *ffmpeg binary actually
// present on this machine*, which no env var can conjure into existence —
// FFMPEG_PATH is this repo's way of saying "yes, one is really there, use
// it," matching the "external integration sits behind an adapter with a
// dev-mock fallback" rule for a local-binary dependency instead of a
// network credential.
export interface VideoFrameSampleInput {
  /** Raw bytes of the uploaded (video-tier) clip. */
  data: Uint8Array;
  /** The clip's content type — used to pick a source filename extension
   * a decoder can sniff a demuxer from. */
  mimeType: string;
  /** Seconds from clip start to extract a frame at (timestamps.ts's
   * output) — one image is returned per timestamp, same order. */
  timestampsSeconds: number[];
}

/** One `data:image/...;base64,...` URL per requested timestamp. */
export interface VideoFrameSampler {
  sample(input: VideoFrameSampleInput): Promise<string[]>;
}
