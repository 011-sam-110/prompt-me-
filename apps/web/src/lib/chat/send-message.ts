// The composition point ENGINEERING_SPEC.md §11 describes: "the window's
// open/closed state is enforced server-side on the message-send endpoint
// itself — a send attempt outside the window must be rejected even if a
// client somehow tries it." Mirrors lib/rewatch/request-rewatch-access.ts's
// shape (pure core decision (@prompt-me/core's evaluateChatSendAccess) +
// mechanical db reads/writes, composed here, `now` threaded through
// explicitly rather than read from an ambient clock so a test controls it
// the same way rewatch's own tests do), and now reuses
// load-chat-window.ts's loadChatWindowForParticipant for the
// existence/participant/active-match checks (factored out once
// get-chat-messages.ts's read path needed the identical guard).
//
// This function is deliberately the ONLY place a chat_messages row gets
// inserted (apps/web/src/app/api/chat/messages/route.ts, the actual
// endpoint, is a thin auth+parsing wrapper around it — same split as
// lib/clips/upload.ts / api/clips/route.ts) — so there is exactly one
// place the window-state check can be bypassed from, and it's this one,
// not the UI.
//
// Realtime delivery (ENGINEERING_SPEC §11: "messages send over Pusher for
// realtime delivery") fires right here, after the createChatMessage write
// below succeeds — @prompt-me/core's getRealtimeProvider() resolves to the
// real PusherRealtimeProvider once PUSHER_* is configured, or the
// in-memory DevMockRealtimeProvider otherwise (packages/core/src/realtime),
// so this call needs zero credentials to work in dev/test.
import { CHAT_MESSAGE_EVENT, chatWindowChannelName, evaluateChatSendAccess, getRealtimeProvider, type ChatSendAccessDecision } from "@prompt-me/core";
import { createChatMessage, type AnyDb, type ChatMessage } from "@prompt-me/db";
import { loadChatWindowForParticipant } from "./load-chat-window";
import { enqueueChatMessageModeration } from "./process-chat-message";

export { ChatWindowNotFoundError, ChatMatchAccessError, ChatMatchNotActiveError } from "./load-chat-window";

/**
 * ENGINEERING_SPEC §11's core rejection — thrown when the window exists and
 * the sender is a legitimate participant, but `now` falls outside
 * [opensAt, closesAt). Carries the decision so the caller (the API route)
 * can return a useful body ("opens in 12 minutes" vs. "this window has
 * closed") without re-deriving it.
 */
export class ChatWindowNotOpenError extends Error {
  constructor(
    chatWindowId: string,
    public readonly decision: Extract<ChatSendAccessDecision, { status: "not_yet_open" | "closed" }>,
  ) {
    super(`send-message: chatWindowId=${chatWindowId} is not open (${decision.status})`);
    this.name = "ChatWindowNotOpenError";
  }
}

export class EmptyChatMessageBodyError extends Error {
  constructor() {
    super("send-message: body must not be empty");
    this.name = "EmptyChatMessageBodyError";
  }
}

export interface SendChatMessageInput {
  chatWindowId: string;
  senderId: string;
  body: string;
}

/**
 * `now` defaults to the real clock for production callers, and is always
 * overridable by a test — same default-parameter shape as
 * lib/rewatch/request-rewatch-access.ts's requestRewatchAccess.
 *
 * Check order matters for what a caller can infer by probing: existence,
 * then participation, then match-active (all three via
 * loadChatWindowForParticipant), then the window-state rule §11 is
 * actually about, then trivial body validity — the same
 * "existence/access before business rule" ordering
 * lib/date-proposals/load-proposal.ts's loadProposalForParticipant already
 * establishes for the sibling date-proposal flows.
 */
export async function sendChatMessage(
  db: AnyDb,
  input: SendChatMessageInput,
  now: Date = new Date(),
): Promise<ChatMessage> {
  const { window } = await loadChatWindowForParticipant(db, input.chatWindowId, input.senderId);

  const decision = evaluateChatSendAccess({ opensAt: window.opensAt, closesAt: window.closesAt }, now);
  if (decision.status !== "allowed") {
    throw new ChatWindowNotOpenError(input.chatWindowId, decision);
  }

  if (input.body.trim().length === 0) {
    throw new EmptyChatMessageBodyError();
  }

  const message = await createChatMessage(db, {
    chatWindowId: input.chatWindowId,
    senderId: input.senderId,
    body: input.body,
  });

  // ENGINEERING_SPEC §12: "Chat messages get the same text-moderation
  // pass, async ... rather than blocking send." Fired here, right after
  // the write succeeds, and deliberately never awaited — same
  // "fire-and-forget after the row exists" shape lib/clips/process-clip.ts
  // uses for enqueueClipProcessing, just triggered inline from the one
  // composition point that creates a chat_messages row instead of from an
  // API route (this file's own header comment: "the ONLY place a
  // chat_messages row gets inserted").
  enqueueChatMessageModeration(db, message.id, message.body);

  // Broadcast only after the write has actually succeeded, so a delivery
  // failure can never leave a "sent" message the recipient never even gets
  // a chance to see arrive live — they'd still see it on next read (chat
  // history isn't gated on this call, get-chat-messages.ts), just not as a
  // live update. A thrown error here does propagate to the caller (no
  // try/catch swallowing it) — same "an external-call failure surfaces
  // loudly rather than being silently absorbed" posture every other
  // adapter call in this codebase takes (e.g. get-or-generate-ideas.ts's
  // uncaught call into the date-idea generator provider).
  await getRealtimeProvider().trigger(chatWindowChannelName(window.id), CHAT_MESSAGE_EVENT, { message });

  return message;
}
