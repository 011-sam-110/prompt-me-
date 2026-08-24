import { afterEach, describe, expect, it } from "vitest";
import { DevMockVideoFrameSampler } from "./dev-mock-sampler";
import { FfmpegVideoFrameSampler } from "./ffmpeg-sampler";
import { getVideoFrameSampler } from "./get-sampler";

const original = process.env.FFMPEG_PATH;

afterEach(() => {
  if (original === undefined) delete process.env.FFMPEG_PATH;
  else process.env.FFMPEG_PATH = original;
});

describe("getVideoFrameSampler", () => {
  it("returns the dev-mock when no FFMPEG_PATH is configured (ROADMAP.md default)", () => {
    delete process.env.FFMPEG_PATH;
    expect(getVideoFrameSampler()).toBeInstanceOf(DevMockVideoFrameSampler);
  });

  it("returns the real ffmpeg-backed sampler once a path is configured", () => {
    process.env.FFMPEG_PATH = "/usr/bin/ffmpeg";
    expect(getVideoFrameSampler()).toBeInstanceOf(FfmpegVideoFrameSampler);
  });
});
