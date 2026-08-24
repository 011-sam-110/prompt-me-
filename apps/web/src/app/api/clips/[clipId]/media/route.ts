// Streams a clip's raw bytes back to a browser's <video>/<audio> element.
// Only ever reached for the dev-mock storage adapter's `dev-blob://` URLs —
// a real Vercel Blob upload is public https and served straight to the
// browser instead (lib/clips/media-url.ts's resolveClipMediaUrl chooses
// which path a given clip takes).
//
// Auth-gated on "signed in" only for now: which *viewer* is allowed to see
// *this* clip at all (feed membership, match state, blocks) is M6/M7's
// candidate-query and match-lifecycle logic, not this milestone's — same
// scope split as feed/page.tsx's M2/M3 placeholder ("the real discovery
// feed ships in M6").
import { NextResponse } from "next/server";
import { getClipStorageAdapter, sniffMediaContentType } from "@prompt-me/core";
import { getClipById } from "@prompt-me/db";
import { getAppDb } from "@/lib/db";
import { getAuthSession } from "@/lib/auth/session";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ clipId: string }> },
): Promise<NextResponse> {
  const { clerkId } = await getAuthSession();
  if (!clerkId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { clipId } = await params;
  const db = await getAppDb();
  const clip = await getClipById(db, clipId);
  if (!clip) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const storage = getClipStorageAdapter();
  const data = await storage.download(clip.storageUrl);
  const contentType = sniffMediaContentType(data);

  return new NextResponse(Buffer.from(data), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(data.byteLength),
      // Per-viewer gated content, not a public asset — never cached by a
      // shared cache.
      "Cache-Control": "private, no-store",
    },
  });
}
