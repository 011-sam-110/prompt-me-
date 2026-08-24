// The actual "used automatically when no real decoder is configured"
// switch — mirrors ../storage/get-adapter.ts exactly, applied to frame
// sampling.
import { isFfmpegConfigured } from "./config";
import { DevMockVideoFrameSampler } from "./dev-mock-sampler";
import { FfmpegVideoFrameSampler } from "./ffmpeg-sampler";
import type { VideoFrameSampler } from "./types";

/**
 * Returns the real ffmpeg-backed sampler when `FFMPEG_PATH` is set,
 * otherwise the placeholder-image dev-mock. Callers never branch on
 * `isFfmpegConfigured()` themselves — this is the single place that
 * decision is made.
 */
export function getVideoFrameSampler(): VideoFrameSampler {
  if (isFfmpegConfigured()) {
    return new FfmpegVideoFrameSampler({ ffmpegPath: process.env.FFMPEG_PATH! });
  }
  return new DevMockVideoFrameSampler();
}
