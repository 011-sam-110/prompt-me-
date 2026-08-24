// Unit tests for our own process-invocation/output-handling logic — not a
// claim this matches real ffmpeg's behavior for every codec (see
// ffmpeg-sampler.ts's top comment: no real binary/recorded clip exists in
// this environment to verify that against). `node:child_process`'s
// execFile is stubbed, same "fake the external effect, prove our own
// plumbing" style as verification/didit-provider.test.ts stubbing fetch.
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

type ExecFileCallback = (error: Error | null, stdout: string, stderr: string) => void;

const execFileMock = vi.fn((_file: string, args: string[], callback: ExecFileCallback) => {
  const outputPath = args[args.length - 1]!;
  // Stand-in for "ffmpeg wrote a frame" — a fake but non-empty byte
  // sequence (real JPEG SOI/EOI markers), written synchronously via the
  // same fs/promises writeFile the real adapter itself later reads back
  // with, so this test proves the adapter's own read-after-write plumbing
  // rather than just asserting args were correct.
  void writeFile(outputPath, Buffer.from([0xff, 0xd8, 0xff, 0xd9])).then(() => callback(null, "", ""));
});

vi.mock("node:child_process", () => ({
  execFile: (...args: unknown[]) => {
    const [file, fileArgs, callback] = args as [string, string[], ExecFileCallback];
    execFileMock(file, fileArgs, callback);
  },
}));

const { FfmpegVideoFrameSampler } = await import("./ffmpeg-sampler");

afterEach(() => {
  execFileMock.mockClear();
});

describe("FfmpegVideoFrameSampler", () => {
  it("invokes ffmpeg once per requested timestamp, seeking with -ss, and returns jpeg data URLs", async () => {
    const sampler = new FfmpegVideoFrameSampler({ ffmpegPath: "/usr/bin/ffmpeg" });
    const frames = await sampler.sample({
      data: new Uint8Array([1, 2, 3]),
      mimeType: "video/webm",
      timestampsSeconds: [0, 10, 20],
    });

    expect(execFileMock).toHaveBeenCalledTimes(3);
    expect(frames).toHaveLength(3);
    for (const frame of frames) {
      expect(frame.startsWith("data:image/jpeg;base64,")).toBe(true);
    }

    const [ffmpegPath0, args0] = execFileMock.mock.calls[0]!;
    expect(ffmpegPath0).toBe("/usr/bin/ffmpeg");
    expect(args0).toEqual(expect.arrayContaining(["-ss", "0", "-frames:v", "1", "-i"]));

    const args1 = execFileMock.mock.calls[1]![1];
    expect(args1).toContain("10");
    const args2 = execFileMock.mock.calls[2]![1];
    expect(args2).toContain("20");
  });

  it("writes the clip bytes to a source file ffmpeg can read, named with the mimeType's extension", async () => {
    const sampler = new FfmpegVideoFrameSampler({ ffmpegPath: "/usr/bin/ffmpeg" });
    await sampler.sample({ data: new Uint8Array([1]), mimeType: "video/mp4", timestampsSeconds: [0] });

    const args = execFileMock.mock.calls[0]![1];
    const inputIndex = args.indexOf("-i");
    const inputPath = args[inputIndex + 1]!;
    expect(inputPath.endsWith("source.mp4")).toBe(true);
  });

  it("cleans up its temp directory after sampling", async () => {
    const sampler = new FfmpegVideoFrameSampler({ ffmpegPath: "/usr/bin/ffmpeg" });
    await sampler.sample({ data: new Uint8Array([1]), mimeType: "video/webm", timestampsSeconds: [0] });

    const args = execFileMock.mock.calls[0]![1];
    const inputIndex = args.indexOf("-i");
    const tempDir = dirname(args[inputIndex + 1]!);
    expect(existsSync(tempDir)).toBe(false);
  });

  it("returns no frames and never calls ffmpeg when given no timestamps", async () => {
    const sampler = new FfmpegVideoFrameSampler({ ffmpegPath: "/usr/bin/ffmpeg" });
    const frames = await sampler.sample({ data: new Uint8Array([1]), mimeType: "video/webm", timestampsSeconds: [] });
    expect(frames).toEqual([]);
    expect(execFileMock).not.toHaveBeenCalled();
  });
});
