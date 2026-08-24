// ENGINEERING_SPEC.md §1: "Object storage: Vercel Blob for clip video/audio
// files." §4's upload flow needs to actually persist bytes somewhere before
// a `clips` row can point `storage_url` at anything real. Mirrors
// verification/types.ts's adapter shape exactly: one small interface, a
// dev-mock, a real implementation, and a config-based selector
// (get-adapter.ts) — CLAUDE.md's "every external integration sits behind
// an adapter with a dev-mock fallback" rule, applied to storage.
export interface ClipStorageUploadInput {
  /** Storage key/path, unique per clip — server-generated, never derived
   * from unsanitized user input (see get-adapter.ts callers). */
  key: string;
  data: Uint8Array;
  contentType: string;
}

export interface ClipStorageUploadResult {
  /** The URL `clips.storage_url` is set to. */
  url: string;
}

export interface ClipStorageAdapter {
  upload(input: ClipStorageUploadInput): Promise<ClipStorageUploadResult>;
  /**
   * Reads back the bytes at a previously-uploaded clip's storage URL.
   * ENGINEERING_SPEC §4/§12's async post-upload step (transcription +
   * moderation) needs the actual media bytes again, not just the URL a
   * viewer's browser would stream from — added for that step rather than
   * M4's first half, which only ever wrote bytes, never read them back.
   */
  download(url: string): Promise<Uint8Array>;
}
