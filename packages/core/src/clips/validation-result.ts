// Shared result shape for every clip-upload validator in this directory
// (dependency.ts, prompt-selection.ts) — a plain ok/reason pair rather than
// throwing, so apps/web's composition layer (lib/clips/upload.ts) can turn
// each failure into its own typed, user-facing error without try/catch
// chains for what are really just business-rule rejections, not exceptions.
export interface ClipValidationResult {
  ok: boolean;
  /** Present only when `ok` is false. */
  reason?: string;
}
