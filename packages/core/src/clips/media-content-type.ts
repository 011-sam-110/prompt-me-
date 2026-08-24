// A clip's real MIME type isn't persisted anywhere on the `clips` row —
// apps/web/src/lib/clips/process-clip.ts's `inferMimeType` already flags
// this as an engineering gap (no recording UI exists yet with a real codec
// choice to persist) and works around it there with a tier-based *parser
// hint* for music-metadata. Serving clip bytes back to a browser for
// playback (ROADMAP.md M5's api/clips/[clipId]/media route) needs an
// actual, correct Content-Type header for the media element to decode the
// bytes at all — a wrong guess there doesn't just mis-tag a file, it
// silently breaks playback — so this sniffs the real container straight
// from the bytes' own magic numbers instead of guessing from the tier.
const WAV_RIFF = [0x52, 0x49, 0x46, 0x46]; // "RIFF" at offset 0
const WAV_WAVE = [0x57, 0x41, 0x56, 0x45]; // "WAVE" at offset 8
const WEBM_EBML = [0x1a, 0x45, 0xdf, 0xa3]; // EBML header at offset 0 (WebM/Matroska)
const MP4_FTYP = [0x66, 0x74, 0x79, 0x70]; // "ftyp" box at offset 4 (MP4/ISO base media)

function matchesAt(data: Uint8Array, offset: number, magic: readonly number[]): boolean {
  if (data.length < offset + magic.length) {
    return false;
  }
  return magic.every((byte, i) => data[offset + i] === byte);
}

/**
 * Best-effort container sniff from magic bytes, covering the formats this
 * codebase's own upload/fixture paths actually produce (WAV from test
 * fixtures, WebM from a browser's MediaRecorder default, MP4 as a common
 * alternative). Falls back to "application/octet-stream" for anything
 * unrecognized rather than guessing — a wrong-but-confident Content-Type
 * would be worse for playback than an honest generic one.
 */
export function sniffMediaContentType(data: Uint8Array): string {
  if (matchesAt(data, 0, WAV_RIFF) && matchesAt(data, 8, WAV_WAVE)) {
    return "audio/wav";
  }
  if (matchesAt(data, 0, WEBM_EBML)) {
    return "video/webm";
  }
  if (matchesAt(data, 4, MP4_FTYP)) {
    return "video/mp4";
  }
  return "application/octet-stream";
}
