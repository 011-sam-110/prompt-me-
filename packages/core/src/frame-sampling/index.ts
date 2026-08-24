// Barrel for @prompt-me/core's video frame sampling (ENGINEERING_SPEC.md
// §12, ROADMAP.md M4/M12).
export { computeFrameSampleTimestamps, FRAME_SAMPLE_INTERVAL_SECONDS } from "./timestamps";
export type { VideoFrameSampleInput, VideoFrameSampler } from "./types";
export { isFfmpegConfigured } from "./config";
export {
  DevMockVideoFrameSampler,
  PLACEHOLDER_FRAME_DATA_URL,
  PLACEHOLDER_FRAME_PNG_BASE64,
} from "./dev-mock-sampler";
export { FfmpegVideoFrameSampler, type FfmpegVideoFrameSamplerConfig } from "./ffmpeg-sampler";
export { getVideoFrameSampler } from "./get-sampler";
