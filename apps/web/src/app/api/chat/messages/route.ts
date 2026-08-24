// The message-send endpoint — ROADMAP.md M11 / ENGINEERING_SPEC.md §11:
// "the window's open/closed state is enforced server-side on the
// message-send endpoint, not just hidden in the UI." Thin by design, same
// split as api/clips/route.ts: auth + request parsing only, all the actual
// window-state enforcement lives in lib/chat/send-message.ts (testable
// without an HTTP layer at all — see send-message.test.ts). This is a
// plain JSON POST, not a Server Action, matching how ENGINEERING_SPEC's
// other "enforced server-side on the X endpoint" rule (§4, clip upload)
// was already built as a real route rather than a Server Action.
import { NextResponse } from "next/server";
import { ensureUserForClerkId } from "@prompt-me/db";
import { getAppDb } from "@/lib/db";
import { getAuthSession } from "@/lib/auth/session";
import {
  ChatMatchAccessError,
  ChatMatchNotActiveError,
  ChatWindowNotFoundError,
  ChatWindowNotOpenError,
  EmptyChatMessageBodyError,
  sendChatMessage,
} from "@/lib/chat/send-message";

interface SendMessageBody {
  chatWindowId?: unknown;
  body?: unknown;
}

export async function POST(request: Request): Promise<NextResponse> {
  const { clerkId } = await getAuthSession();
  if (!clerkId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let payload: SendMessageBody;
  try {
    payload = (await request.json()) as SendMessageBody;
  } catch {
    return NextResponse.json({ error: "expected a JSON body" }, { status: 400 });
  }

  if (typeof payload.chatWindowId !== "string" || payload.chatWindowId.length === 0) {
    return NextResponse.json({ error: "a 'chatWindowId' field is required" }, { status: 400 });
  }
  if (typeof payload.body !== "string") {
    return NextResponse.json({ error: "a 'body' field is required" }, { status: 400 });
  }

  const db = await getAppDb();
  const user = await ensureUserForClerkId(db, clerkId);

  try {
    const message = await sendChatMessage(db, {
      chatWindowId: payload.chatWindowId,
      senderId: user.id,
      body: payload.body,
    });
    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    if (error instanceof ChatWindowNotFoundError || error instanceof ChatMatchAccessError) {
      // Same "not found" status for both a bad id and a real window this
      // sender isn't party to — a caller can't distinguish "doesn't exist"
      // from "exists but isn't yours" by probing, mirroring
      // date-proposals' own not-found-shaped errors.
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof ChatMatchNotActiveError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof ChatWindowNotOpenError) {
      return NextResponse.json({ error: error.message, decision: error.decision }, { status: 403 });
    }
    if (error instanceof EmptyChatMessageBodyError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
