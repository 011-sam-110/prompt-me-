import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { MOCK_BLOB_URL_SCHEME, MockClipStorageAdapter, readMockClipBytes } from "./mock-clip-storage-adapter";

const DATA_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../.dev-blob-data");

afterAll(async () => {
  await rm(DATA_DIR, { recursive: true, force: true });
});

describe("MockClipStorageAdapter", () => {
  it("genuinely persists the uploaded bytes — readMockClipBytes reads back exactly what was written", async () => {
    const adapter = new MockClipStorageAdapter();
    const key = `test/${randomUUID()}.bin`;
    const data = new Uint8Array([1, 2, 3, 4, 5, 250, 251, 252]);

    const { url } = await adapter.upload({ key, data, contentType: "application/octet-stream" });

    expect(url).toBe(`${MOCK_BLOB_URL_SCHEME}${key}`);
    const readBack = await readMockClipBytes(key);
    expect(Array.from(readBack)).toEqual(Array.from(data));
  });

  it("supports nested keys (userId/tier path segments)", async () => {
    const adapter = new MockClipStorageAdapter();
    const key = `clips/${randomUUID()}/tier-1-${randomUUID()}.webm`;
    const data = new Uint8Array([9, 9, 9]);

    await adapter.upload({ key, data, contentType: "audio/webm" });
    const readBack = await readMockClipBytes(key);
    expect(Array.from(readBack)).toEqual([9, 9, 9]);
  });

  it("rejects a key that attempts to escape the data directory", async () => {
    const adapter = new MockClipStorageAdapter();
    await expect(
      adapter.upload({ key: "../../escape.bin", data: new Uint8Array([1]), contentType: "text/plain" }),
    ).rejects.toThrow(/unsafe storage key/);
  });
});
