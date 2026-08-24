// ENGINEERING_SPEC.md §1: "Object storage: Vercel Blob for clip video/audio
// files." Real implementation, selected automatically once
// BLOB_READ_WRITE_TOKEN is configured (config.ts / get-adapter.ts) — no
// real token exists yet (ROADMAP.md → Needs from Sampo), so this has never
// run against a live Vercel Blob store. Uses the official `@vercel/blob`
// SDK rather than hand-rolling the upload protocol (unlike the Didit
// provider's plain `fetch`, verification/didit-provider.ts) — Blob's
// multipart protocol for larger files (a 3-minute video clip) isn't a
// simple single PUT, and re-implementing it would just be a worse copy of
// what the SDK already does correctly.
import { put } from "@vercel/blob";
import type { ClipStorageAdapter, ClipStorageUploadInput, ClipStorageUploadResult } from "./types";

export interface VercelBlobStorageAdapterConfig {
  token: string;
}

export class VercelBlobStorageAdapter implements ClipStorageAdapter {
  private readonly token: string;

  constructor(config: VercelBlobStorageAdapterConfig) {
    this.token = config.token;
  }

  async upload(input: ClipStorageUploadInput): Promise<ClipStorageUploadResult> {
    // @vercel/blob's PutBody type doesn't include a plain Uint8Array (only
    // Buffer/Blob/Readable/ReadableStream/File/string) — Buffer.from(...)
    // over the same underlying bytes is a zero-copy view, not a
    // duplication of the data.
    const body = Buffer.from(input.data.buffer, input.data.byteOffset, input.data.byteLength);
    const blob = await put(input.key, body, {
      access: "public",
      contentType: input.contentType,
      token: this.token,
      // Our key already includes a per-clip UUID (see apps/web's
      // lib/clips/upload.ts) — a random suffix on top would just make the
      // stored URL less readable for no benefit.
      addRandomSuffix: false,
      // Clips run up to 3 minutes of video (SPEC.md §2); let the SDK
      // chunk/parallelize/retry large uploads rather than assuming every
      // clip is small enough for one request.
      multipart: true,
    });
    return { url: blob.url };
  }

  async download(url: string): Promise<Uint8Array> {
    // Uploaded with `access: "public"` (see upload() above), so a plain
    // GET needs no auth token to read the bytes back.
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`VercelBlobStorageAdapter.download failed: ${response.status} ${response.statusText}`);
    }
    return new Uint8Array(await response.arrayBuffer());
  }
}
