// ENGINEERING_SPEC §12: "1 sampled frame per 10 seconds of video" needs
// real image bytes once real credentials exist to check them against
// omni-moderation. No deployment target for a real ffmpeg binary has been
// chosen yet (ROADMAP.md → Needs from Sampo doesn't list one), so this has
// never run against a real recorded clip in this environment — same
// "best-effort, unverified" caveat as verification/didit-provider.ts and
// ../transcription/whisper-provider.ts, applied to a local decoder instead
// of a network call. Selected automatically once FFMPEG_PATH is set
// (config.ts/get-sampler.ts); otherwise DevMockVideoFrameSampler runs.
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { VideoFrameSampleInput, VideoFrameSampler } from "./types";

const execFileAsync = promisify(execFile);

export interface FfmpegVideoFrameSamplerConfig {
  /** Path to the ffmpeg binary — never assumed to be on PATH by default,
   * same "don't assume, take it explicitly" stance as every other real
   * adapter's config in this package. */
  ffmpegPath: string;
}

/** Picks a source filename extension a decoder can sniff a demuxer from —
 * mirrors ../transcription/whisper-provider.ts's filenameForMimeType. */
function extensionForMimeType(mimeType: string): string {
  const subtype = mimeType.split("/")[1]?.split(";")[0];
  return subtype && subtype.length > 0 ? subtype : "webm";
}

export class FfmpegVideoFrameSampler implements VideoFrameSampler {
  private readonly ffmpegPath: string;

  constructor(config: FfmpegVideoFrameSamplerConfig) {
    this.ffmpegPath = config.ffmpegPath;
  }

  async sample(input: VideoFrameSampleInput): Promise<string[]> {
    const dir = await mkdtemp(join(tmpdir(), "prompt-me-frames-"));
    try {
      const inputPath = join(dir, `source.${extensionForMimeType(input.mimeType)}`);
      await writeFile(inputPath, input.data);

      const frames: string[] = [];
      for (const [index, atSeconds] of input.timestampsSeconds.entries()) {
        const outputPath = join(dir, `frame-${index}.jpg`);
        // -ss before -i seeks the input demuxer directly (fast, and precise
        // enough for a moderation sample point — this isn't a scrub-bar
        // seek that needs frame-exact accuracy).
        await execFileAsync(this.ffmpegPath, [
          "-ss",
          String(atSeconds),
          "-i",
          inputPath,
          "-frames:v",
          "1",
          "-q:v",
          "4",
          "-y",
          outputPath,
        ]);
        const bytes = await readFile(outputPath);
        frames.push(`data:image/jpeg;base64,${bytes.toString("base64")}`);
      }
      return frames;
    } finally {
      // Clip bytes and every extracted frame only ever touch a
      // process-local temp dir, cleaned up unconditionally — nothing
      // written by this adapter is meant to outlive one sample() call.
      await rm(dir, { recursive: true, force: true });
    }
  }
}
