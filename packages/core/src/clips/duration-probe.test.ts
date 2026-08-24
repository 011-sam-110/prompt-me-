// Builds real, valid WAV files in memory with an exact, controllable
// duration (RIFF header + N samples of silence) rather than mocking
// `music-metadata` — proves this reads a *genuine* container duration,
// not a stubbed-out return value. WAV is chosen over WebM/MP4 fixtures
// because its duration is fully determined by a header field + byte count
// that's trivial to construct precisely by hand; the parser doesn't care
// which container format produced the bytes.
import { describe, expect, it } from "vitest";
import { ClipDurationProbeError, probeClipDurationSeconds } from "./duration-probe";

function makeWavFixture(durationSeconds: number, sampleRate = 8000): Uint8Array {
  const numSamples = Math.round(durationSeconds * sampleRate);
  const dataSize = numSamples * 2; // 16-bit mono PCM
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  return new Uint8Array(buf);
}

describe("probeClipDurationSeconds", () => {
  it("measures a 15s fixture as ~15s", async () => {
    const duration = await probeClipDurationSeconds(makeWavFixture(15), "audio/wav");
    expect(duration).toBeCloseTo(15, 1);
  });

  it("measures each tier's target duration accurately", async () => {
    for (const target of [15, 30, 120, 180]) {
      const duration = await probeClipDurationSeconds(makeWavFixture(target), "audio/wav");
      expect(duration).toBeCloseTo(target, 1);
    }
  });

  it("is not fooled by a mismatched mimeType hint — reads the real container data regardless", async () => {
    // The hint says video/webm, but the bytes are a real WAV file; a
    // format-sniffing parser should still find the actual WAV header.
    const duration = await probeClipDurationSeconds(makeWavFixture(30), "video/webm");
    expect(duration).toBeCloseTo(30, 1);
  });

  it("rejects bytes with no parseable container/duration", async () => {
    const garbage = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    await expect(probeClipDurationSeconds(garbage, "audio/wav")).rejects.toThrow(ClipDurationProbeError);
  });
});
