// The dev-mock realtime transport's browser half — ENGINEERING_SPEC §11 /
// ROADMAP.md M11: "Vercel functions can't hold long-lived sockets" is true
// of the REAL Pusher path (the browser talks to Pusher directly over its
// own websocket connection — see components/chat/chat-window.tsx, which
// uses pusher-js), but the dev-mock fallback has no external pub/sub
// service to connect to. This route IS that fallback's long-lived
// connection: a Server-Sent-Events stream over @prompt-me/core's in-memory
// dev-mock bus (packages/core/src/realtime/dev-mock-provider.ts).
//
// Reachable regardless of which realtime provider send-message.ts actually
// used for a given send — if PUSHER_* is configured, sendChatMessage's
// trigger() goes to the real Pusher provider instead of this route's bus,
// so this stream simply never receives anything in that case (harmless:
// chat-window.tsx branches on NEXT_PUBLIC_PUSHER_KEY/_CLUSTER client-side
// and never opens this connection at all once real Pusher is configured).
//
// Same auth + participant guard as the send path (send-message.ts) and the
// read path (get-chat-messages.ts) — loadChatWindowForParticipant — so a
// stranger can't open an SSE stream for a match they aren't part of, and an
// Escaped pair's stream is refused the same way a send would be.
import { chatWindowChannelName } from "@prompt-me/core/chat-windows";
import { subscribeDevMockChannel } from "@prompt-me/core";
import { ensureUserForClerkId } from "@prompt-me/db";
import { getAppDb } from "@/lib/db";
import { getAuthSession } from "@/lib/auth/session";
import {
  ChatMatchAccessError,
  ChatMatchNotActiveError,
  ChatWindowNotFoundError,
  loadChatWindowForParticipant,
} from "@/lib/chat/load-chat-window";

// Real-time streaming — never statically optimized/cached.
export const dynamic = "force-dynamic";

const KEEP_ALIVE_INTERVAL_MS = 15_000;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ chatWindowId: string }> },
): Promise<Response> {
  const { chatWindowId } = await params;
  const { clerkId } = await getAuthSession();
  if (!clerkId) {
    return new Response("unauthenticated", { status: 401 });
  }

  const db = await getAppDb();
  const user = await ensureUserForClerkId(db, clerkId);

  try {
    await loadChatWindowForParticipant(db, chatWindowId, user.id);
  } catch (error) {
    if (error instanceof ChatWindowNotFoundError || error instanceof ChatMatchAccessError) {
      return new Response("not found", { status: 404 });
    }
    if (error instanceof ChatMatchNotActiveError) {
      return new Response("forbidden", { status: 403 });
    }
    throw error;
  }

  const channel = chatWindowChannelName(chatWindowId);
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const unsubscribe = subscribeDevMockChannel(channel, (evt) => {
        controller.enqueue(encoder.encode(`event: ${evt.event}\ndata: ${JSON.stringify(evt.payload)}\n\n`));
      });

      // Without a periodic write, some intermediary (or a browser's own
      // idle-connection handling) can silently drop an SSE connection that
      // never sends anything — a comment line (SSE ignores lines starting
      // with `:`) keeps the stream visibly alive without ever surfacing as
      // a fake event to EventSource's onmessage/addEventListener handlers.
      const keepAlive = setInterval(() => {
        controller.enqueue(encoder.encode(`: keep-alive\n\n`));
      }, KEEP_ALIVE_INTERVAL_MS);

      const stop = () => {
        clearInterval(keepAlive);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // Already closed (e.g. the client disconnected right as a
          // keep-alive tick fired) — nothing left to do.
        }
      };
      request.signal.addEventListener("abort", stop);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "private, no-store, no-transform",
      Connection: "keep-alive",
      // Disables response buffering on proxies that respect it (nginx and
      // similar) — irrelevant to `next dev`/Vercel directly, but harmless
      // to send and the standard header for an SSE stream.
      "X-Accel-Buffering": "no",
    },
  });
}
