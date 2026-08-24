// Whether a real ffmpeg binary has been configured for this deployment.
// Mirrors ../storage/config.ts's isVercelBlobConfigured() shape (env var
// presence -> "use the real thing"), but for a local-binary dependency
// rather than a network credential — see types.ts's top comment for why
// that distinction still fits the same adapter pattern. No deployment
// target for a real ffmpeg binary has been chosen yet (ROADMAP.md → Needs
// from Sampo), so this is false in every environment today and
// DevMockVideoFrameSampler is what actually runs.
export function isFfmpegConfigured(): boolean {
  return Boolean(process.env.FFMPEG_PATH);
}
