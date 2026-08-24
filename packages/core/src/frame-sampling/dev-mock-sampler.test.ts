import { describe, expect, it } from "vitest";
import { computeFrameSampleTimestamps } from "./timestamps";
import { DevMockVideoFrameSampler, PLACEHOLDER_FRAME_DATA_URL } from "./dev-mock-sampler";

describe("DevMockVideoFrameSampler", () => {
  it("returns exactly one placeholder frame per requested timestamp", async () => {
    const sampler = new DevMockVideoFrameSampler();
    const timestampsSeconds = computeFrameSampleTimestamps(30); // [0, 10, 20]
    const frames = await sampler.sample({ data: new Uint8Array([1, 2, 3]), mimeType: "video/webm", timestampsSeconds });

    expect(frames).toHaveLength(3);
    expect(frames.every((f) => f === PLACEHOLDER_FRAME_DATA_URL)).toBe(true);
  });

  it("ignores the actual clip bytes entirely — same output regardless of input data", async () => {
    const sampler = new DevMockVideoFrameSampler();
    const a = await sampler.sample({ data: new Uint8Array([9, 9, 9]), mimeType: "video/mp4", timestampsSeconds: [0] });
    const b = await sampler.sample({ data: new Uint8Array(0), mimeType: "video/webm", timestampsSeconds: [0] });
    expect(a).toEqual(b);
  });

  it("returns no frames when no timestamps are requested", async () => {
    const sampler = new DevMockVideoFrameSampler();
    const frames = await sampler.sample({ data: new Uint8Array([1]), mimeType: "video/webm", timestampsSeconds: [] });
    expect(frames).toEqual([]);
  });

  it("the placeholder is a genuinely valid, well-formed PNG data URL", async () => {
    expect(PLACEHOLDER_FRAME_DATA_URL.startsWith("data:image/png;base64,")).toBe(true);
    const base64 = PLACEHOLDER_FRAME_DATA_URL.slice("data:image/png;base64,".length);
    const bytes = Buffer.from(base64, "base64");
    // PNG signature.
    expect(Array.from(bytes.subarray(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  });
});
