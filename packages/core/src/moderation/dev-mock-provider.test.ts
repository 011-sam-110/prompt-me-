import { describe, expect, it } from "vitest";
import { DevMockModerationProvider } from "./dev-mock-provider";

describe("DevMockModerationProvider", () => {
  it("always reports clean for text input, ignoring the actual content", async () => {
    const provider = new DevMockModerationProvider();
    const result = await provider.moderate({ type: "text", text: "literally anything, even something bad" });
    expect(result).toEqual({ flagged: false, categories: [] });
  });

  it("always reports clean for image input too", async () => {
    const provider = new DevMockModerationProvider();
    const result = await provider.moderate({ type: "image", imageDataUrl: "data:image/jpeg;base64,ZmFrZQ==" });
    expect(result).toEqual({ flagged: false, categories: [] });
  });
});
