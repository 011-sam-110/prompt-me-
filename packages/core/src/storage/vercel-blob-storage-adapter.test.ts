// No real Vercel Blob token exists yet (ROADMAP.md → Needs from Sampo), so
// this mocks the `@vercel/blob` SDK's `put()` rather than hitting a real
// store — proves this adapter calls it with the right shape (token,
// access, contentType, the exact bytes) and maps its result to
// ClipStorageUploadResult, without depending on network access.
import { describe, expect, it, vi } from "vitest";

const putMock = vi.fn();
vi.mock("@vercel/blob", () => ({
  put: (...args: unknown[]) => putMock(...args),
}));

const { VercelBlobStorageAdapter } = await import("./vercel-blob-storage-adapter");

describe("VercelBlobStorageAdapter", () => {
  it("calls @vercel/blob's put() with the given bytes/contentType and the configured token, public access", async () => {
    putMock.mockResolvedValueOnce({ url: "https://example.public.blob.vercel-storage.com/clips/abc.webm" });

    const adapter = new VercelBlobStorageAdapter({ token: "test-token" });
    const data = new Uint8Array([1, 2, 3]);
    const result = await adapter.upload({ key: "clips/abc.webm", data, contentType: "video/webm" });

    expect(putMock).toHaveBeenCalledTimes(1);
    const [pathname, body, options] = putMock.mock.calls[0];
    expect(pathname).toBe("clips/abc.webm");
    expect(Buffer.isBuffer(body)).toBe(true);
    expect(Array.from(body as Buffer)).toEqual(Array.from(data));
    expect(options).toMatchObject({
      access: "public",
      contentType: "video/webm",
      token: "test-token",
      addRandomSuffix: false,
      multipart: true,
    });
    expect(result).toEqual({ url: "https://example.public.blob.vercel-storage.com/clips/abc.webm" });
  });
});
