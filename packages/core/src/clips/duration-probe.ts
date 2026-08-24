// ENGINEERING_SPEC §4: "Duration is validated server-side against the
// tier's fixed length... never trust client-reported duration." This is
// the piece that makes that literal — it reads the *actual* duration
// baked into the uploaded media's own container metadata (a WAV/WebM/MP4
// header's sample count or Duration element), via `music-metadata`. No
// code path in this package (or apps/web's upload flow that calls it) ever
// reads a client-supplied duration field at all, so there's nothing to
// "trust" by mistake.
//
// Not behind a dev-mock/real adapter split like verification or storage —
// there's no external credential or service involved (this is local, pure
// parsing of the bytes already in memory), so there's nothing to mock.
import { parseBuffer } from "music-metadata";

export class ClipDurationProbeError extends Error {}

/**
 * A wrong/imprecise `mimeType` hint can make `music-metadata` pick the
 * wrong parser outright (e.g. a browser-reported "video/webm" routes
 * straight to the Matroska/EBML parser, which then throws on bytes that
 * aren't actually EBML) rather than falling back to sniffing the real
 * container from the bytes. Since the declared content type is exactly
 * the kind of client-supplied metadata this function already refuses to
 * trust for anything load-bearing, a failed hinted parse retries once
 * with no hint at all, letting `music-metadata` detect the real container
 * from the bytes themselves.
 */
async function tryParseDurationSeconds(data: Uint8Array, fileInfo?: string): Promise<number | undefined> {
  try {
    const metadata = await parseBuffer(data, fileInfo);
    const duration = metadata.format.duration;
    return typeof duration === "number" && Number.isFinite(duration) && duration > 0
      ? duration
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * @param data Raw bytes of the uploaded clip.
 * @param mimeType The upload's declared content type (e.g. "audio/webm"),
 * used only as a first-attempt parser hint — the returned duration always
 * comes from the file's own container metadata, and a mismatched hint
 * falls back to content-sniffing rather than failing outright.
 */
export async function probeClipDurationSeconds(data: Uint8Array, mimeType?: string): Promise<number> {
  let duration = await tryParseDurationSeconds(data, mimeType);
  if (duration === undefined && mimeType !== undefined) {
    duration = await tryParseDurationSeconds(data);
  }
  if (duration === undefined) {
    throw new ClipDurationProbeError(
      "could not determine a valid duration from the uploaded media's container metadata",
    );
  }
  return duration;
}
