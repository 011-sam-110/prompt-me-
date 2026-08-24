// The "used automatically when no [credential] is configured" switch —
// mirrors verification/get-provider.ts exactly, applied to storage.
import { isVercelBlobConfigured } from "./config";
import { MockClipStorageAdapter } from "./mock-clip-storage-adapter";
import { VercelBlobStorageAdapter } from "./vercel-blob-storage-adapter";
import type { ClipStorageAdapter } from "./types";

/**
 * Returns the real Vercel Blob-backed adapter when `BLOB_READ_WRITE_TOKEN`
 * is set, otherwise the file-backed dev mock. Callers never branch on
 * `isVercelBlobConfigured()` themselves.
 */
export function getClipStorageAdapter(): ClipStorageAdapter {
  if (isVercelBlobConfigured()) {
    return new VercelBlobStorageAdapter({ token: process.env.BLOB_READ_WRITE_TOKEN! });
  }
  return new MockClipStorageAdapter();
}
