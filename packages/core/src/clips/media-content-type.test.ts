import { describe, expect, it } from "vitest";
import { sniffMediaContentType } from "./media-content-type";

function wavHeader(): Uint8Array {
  const buf = Buffer.alloc(44);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  return new Uint8Array(buf);
}

describe("sniffMediaContentType", () => {
  it("recognizes a WAV container", () => {
    expect(sniffMediaContentType(wavHeader())).toBe("audio/wav");
  });

  it("recognizes a WebM/Matroska EBML header", () => {
    expect(sniffMediaContentType(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x00, 0x00]))).toBe(
      "video/webm",
    );
  });

  it("recognizes an MP4 ftyp box", () => {
    // "size" (4 bytes, arbitrary) + "ftyp" at offset 4.
    expect(
      sniffMediaContentType(new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70])),
    ).toBe("video/mp4");
  });

  it("falls back to octet-stream for unrecognized bytes", () => {
    expect(sniffMediaContentType(new Uint8Array([0x01, 0x02, 0x03, 0x04]))).toBe(
      "application/octet-stream",
    );
  });

  it("falls back rather than throwing on very short input", () => {
    expect(sniffMediaContentType(new Uint8Array([]))).toBe("application/octet-stream");
    expect(sniffMediaContentType(new Uint8Array([0x52, 0x49]))).toBe("application/octet-stream");
  });

  it("requires WAVE at offset 8, not just RIFF at offset 0", () => {
    const buf = Buffer.alloc(44);
    buf.write("RIFF", 0);
    buf.write("XXXX", 8); // not "WAVE"
    expect(sniffMediaContentType(new Uint8Array(buf))).toBe("application/octet-stream");
  });
});
