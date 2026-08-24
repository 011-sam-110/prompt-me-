// Used automatically whenever FFMPEG_PATH isn't configured (get-sampler.ts)
// — true for this whole repo today. Doesn't attempt to decode the actual
// clip bytes at all (no ffmpeg means no way to); instead it returns a
// fixed, genuinely-valid 1x1 pixel PNG per requested timestamp — real,
// well-formed image bytes (byte-verified: signature, chunk CRCs, and IHDR
// fields all check out, and it inflates back to exactly one gray pixel),
// so nothing downstream chokes on malformed image data, just not derived
// from the real clip. Mirrors ../storage/mock-clip-storage-adapter.ts's
// "genuinely functional, not just plausible-looking" philosophy.
import type { VideoFrameSampleInput, VideoFrameSampler } from "./types";

/** A real, minimal, valid 1x1 grayscale PNG (67 bytes), base64-encoded. */
export const PLACEHOLDER_FRAME_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNgAAAAAgABSK+kcQAAAABJRU5ErkJggg==";

export const PLACEHOLDER_FRAME_DATA_URL = `data:image/png;base64,${PLACEHOLDER_FRAME_PNG_BASE64}`;

export class DevMockVideoFrameSampler implements VideoFrameSampler {
  // input.data/mimeType are genuinely unused (see doc comment above) —
  // underscore-prefixed per this package's eslint argsIgnorePattern; only
  // the requested *count* of timestamps drives the output, matching how
  // many frames a real decoder would have been asked for.
  async sample(input: VideoFrameSampleInput): Promise<string[]> {
    return input.timestampsSeconds.map(() => PLACEHOLDER_FRAME_DATA_URL);
  }
}
