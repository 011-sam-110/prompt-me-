import { afterEach, describe, expect, it } from "vitest";
import { isFfmpegConfigured } from "./config";

const original = process.env.FFMPEG_PATH;

afterEach(() => {
  if (original === undefined) delete process.env.FFMPEG_PATH;
  else process.env.FFMPEG_PATH = original;
});

describe("isFfmpegConfigured", () => {
  it("is false with no FFMPEG_PATH (the ROADMAP.md default — no deployment target chosen yet)", () => {
    delete process.env.FFMPEG_PATH;
    expect(isFfmpegConfigured()).toBe(false);
  });

  it("is false for an empty string (falsy, not just unset)", () => {
    process.env.FFMPEG_PATH = "";
    expect(isFfmpegConfigured()).toBe(false);
  });

  it("is true once a path is set", () => {
    process.env.FFMPEG_PATH = "/usr/bin/ffmpeg";
    expect(isFfmpegConfigured()).toBe(true);
  });
});
