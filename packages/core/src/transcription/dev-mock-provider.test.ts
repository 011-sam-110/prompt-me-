import { describe, expect, it } from "vitest";
import { DEV_MOCK_TRANSCRIPT_TEXT, DevMockTranscriptionProvider } from "./dev-mock-provider";

describe("DevMockTranscriptionProvider", () => {
  it("always returns the fixed placeholder transcript, ignoring the input entirely", async () => {
    const provider = new DevMockTranscriptionProvider();
    const result = await provider.transcribe({ data: new Uint8Array([1, 2, 3]), mimeType: "audio/wav" });
    expect(result).toEqual({ transcript: DEV_MOCK_TRANSCRIPT_TEXT });
  });

  it("is deterministic across different inputs", async () => {
    const provider = new DevMockTranscriptionProvider();
    const a = await provider.transcribe({ data: new Uint8Array([9, 9, 9]), mimeType: "video/webm" });
    const b = await provider.transcribe({ data: new Uint8Array(0), mimeType: "audio/mpeg" });
    expect(a).toEqual(b);
  });
});
