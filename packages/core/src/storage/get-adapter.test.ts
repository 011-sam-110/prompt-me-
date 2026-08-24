import { afterEach, describe, expect, it } from "vitest";
import { getClipStorageAdapter } from "./get-adapter";
import { MockClipStorageAdapter } from "./mock-clip-storage-adapter";
import { VercelBlobStorageAdapter } from "./vercel-blob-storage-adapter";

const original = process.env.BLOB_READ_WRITE_TOKEN;
afterEach(() => {
  if (original === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
  else process.env.BLOB_READ_WRITE_TOKEN = original;
});

describe("getClipStorageAdapter", () => {
  it("returns the mock adapter with no token configured", () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    expect(getClipStorageAdapter()).toBeInstanceOf(MockClipStorageAdapter);
  });

  it("returns the real Vercel Blob adapter once a token is configured", () => {
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test_token";
    expect(getClipStorageAdapter()).toBeInstanceOf(VercelBlobStorageAdapter);
  });
});
