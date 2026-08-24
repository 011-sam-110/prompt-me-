import { describe, expect, it } from "vitest";
import { resolveClipMediaUrl } from "./media-url";

describe("resolveClipMediaUrl", () => {
  it("passes a real https Vercel Blob URL straight through", () => {
    const url = resolveClipMediaUrl({ id: "clip-1", storageUrl: "https://example.blob.vercel-storage.com/x" });
    expect(url).toBe("https://example.blob.vercel-storage.com/x");
  });

  it("passes a plain http URL straight through too", () => {
    const url = resolveClipMediaUrl({ id: "clip-1", storageUrl: "http://localhost:1234/x" });
    expect(url).toBe("http://localhost:1234/x");
  });

  it("routes a dev-mock dev-blob:// URL through this app's own media proxy", () => {
    const url = resolveClipMediaUrl({ id: "clip-abc", storageUrl: "dev-blob://clips/x/tier-1-a.wav" });
    expect(url).toBe("/api/clips/clip-abc/media");
  });
});
