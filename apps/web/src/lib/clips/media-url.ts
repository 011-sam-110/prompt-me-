// Chooses what URL a browser's <video>/<audio src> should point at for a
// given clip. A real Vercel Blob upload (VercelBlobStorageAdapter,
// @prompt-me/core) is stored with `access: "public"` and returns a real
// https:// URL a browser can fetch directly — ENGINEERING_SPEC §1. The
// dev-mock adapter's `dev-blob://` URL (MockClipStorageAdapter) is *not*
// fetchable by a browser at all — it's a local-filesystem key, not a
// network address — so that case is routed through this app's own
// byte-streaming proxy instead (api/clips/[clipId]/media/route.ts), which
// reads the same bytes back via the storage adapter's own download().
export function resolveClipMediaUrl(clip: { id: string; storageUrl: string }): string {
  if (clip.storageUrl.startsWith("http://") || clip.storageUrl.startsWith("https://")) {
    return clip.storageUrl;
  }
  return `/api/clips/${clip.id}/media`;
}
