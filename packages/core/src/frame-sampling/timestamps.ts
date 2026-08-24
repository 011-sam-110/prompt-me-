// ENGINEERING_SPEC §12: "1 sampled frame per 10 seconds of video." Pure
// and DB/adapter-free — this is the "how many, and at what timestamps"
// rule, kept separate from actual frame *extraction* (sampler-types.ts's
// VideoFrameSampler), the same split ../clips/duration-probe.ts draws
// between "a pure rule" and "a thing that needs real bytes/an external
// dependency to carry out."
export const FRAME_SAMPLE_INTERVAL_SECONDS = 10;

/**
 * Timestamps (seconds from clip start) to sample, one per
 * FRAME_SAMPLE_INTERVAL_SECONDS of video, starting at 0 — so a 30s clip
 * samples at [0, 10, 20] (3 frames), a 120s clip at 12 frames, etc. A clip
 * shorter than the interval still gets exactly one frame at t=0 (there's
 * always *something* to check); a zero/negative duration returns no
 * timestamps at all (nothing to sample — matches an audio-only tier 1
 * clip, which never calls this at all, see apps/web's process-clip.ts).
 */
export function computeFrameSampleTimestamps(
  durationSeconds: number,
  intervalSeconds: number = FRAME_SAMPLE_INTERVAL_SECONDS,
): number[] {
  if (durationSeconds <= 0) return [];
  const count = Math.max(1, Math.ceil(durationSeconds / intervalSeconds));
  return Array.from({ length: count }, (_, i) => i * intervalSeconds);
}
