// Dev fallback for ClipStorageAdapter — used automatically whenever no
// BLOB_READ_WRITE_TOKEN is configured (see get-adapter.ts), the same "used
// automatically when [credential] is absent" shape ROADMAP.md M3
// established for the verification dev-mock (get-provider.ts).
//
// Unlike DevMockVerificationProvider (which never even reads its input —
// there's nothing to retain once a verification check is done), this mock
// *does* write real bytes to a local, gitignored directory rather than
// discarding them or returning a fake-looking placeholder URL: an uploaded
// clip needs to still exist somewhere for later milestones (M5 playback)
// to eventually read back, and CLAUDE.md's "never fake results" rule
// argues for a mock that's genuinely functional over one that merely looks
// like it worked. Mirrors packages/db/src/dev-client.ts's file-backed
// PGlite pattern, applied to blob bytes instead of Postgres pages.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ClipStorageAdapter, ClipStorageUploadInput, ClipStorageUploadResult } from "./types";

const DATA_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../.dev-blob-data");

/** URL scheme every mock upload's returned URL uses — never a real
 * http(s) URL, so nothing downstream can mistake a mock upload for a real
 * Vercel Blob one just by looking at the stored `storage_url`. */
export const MOCK_BLOB_URL_SCHEME = "dev-blob://";

/**
 * Keys are server-generated (apps/web builds them from a userId/tier/UUID,
 * never from raw client input — see lib/clips/upload.ts), but this checks
 * anyway rather than trusting that invariant silently: a key can only
 * resolve to a path inside DATA_DIR.
 */
function assertSafeKey(key: string): void {
  const normalized = key.replace(/\\/g, "/");
  if (normalized.startsWith("/") || normalized.split("/").some((segment) => segment === "..")) {
    throw new Error(`refusing unsafe storage key: ${key}`);
  }
}

export class MockClipStorageAdapter implements ClipStorageAdapter {
  async upload(input: ClipStorageUploadInput): Promise<ClipStorageUploadResult> {
    assertSafeKey(input.key);
    const filePath = resolve(DATA_DIR, input.key);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, input.data);
    return { url: `${MOCK_BLOB_URL_SCHEME}${input.key}` };
  }

  async download(url: string): Promise<Uint8Array> {
    if (!url.startsWith(MOCK_BLOB_URL_SCHEME)) {
      throw new Error(`MockClipStorageAdapter.download: not a ${MOCK_BLOB_URL_SCHEME} URL: ${url}`);
    }
    return readMockClipBytes(url.slice(MOCK_BLOB_URL_SCHEME.length));
  }
}

/**
 * Test/dev-only escape hatch to read back exactly what `upload()` wrote —
 * what proves the mock is genuinely functional rather than just returning
 * a plausible-looking URL (see mock-clip-storage-adapter.test.ts).
 */
export async function readMockClipBytes(key: string): Promise<Uint8Array> {
  assertSafeKey(key);
  return new Uint8Array(await readFile(resolve(DATA_DIR, key)));
}
