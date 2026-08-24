// Whether a real Vercel Blob store is configured. Mirrors
// verification/config.ts's isDiditConfigured() exactly, applied to Vercel
// Blob — ROADMAP.md's "Needs from Sampo" doesn't list a Blob token yet, so
// this is false in every environment today and the mock adapter
// (mock-clip-storage-adapter.ts) is what actually runs.
export function isVercelBlobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}
