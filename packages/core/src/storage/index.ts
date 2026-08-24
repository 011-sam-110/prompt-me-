// Barrel for @prompt-me/core's clip storage adapter (ENGINEERING_SPEC.md
// §1/§4, ROADMAP.md M4).
export type { ClipStorageAdapter, ClipStorageUploadInput, ClipStorageUploadResult } from "./types";
export { isVercelBlobConfigured } from "./config";
export { MockClipStorageAdapter, MOCK_BLOB_URL_SCHEME, readMockClipBytes } from "./mock-clip-storage-adapter";
export { VercelBlobStorageAdapter, type VercelBlobStorageAdapterConfig } from "./vercel-blob-storage-adapter";
export { getClipStorageAdapter } from "./get-adapter";
