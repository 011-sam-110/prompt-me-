// The composition point ENGINEERING_SPEC.md §11 describes: "the window's
// open/closed state is enforced server-side on the message-send endpoint
// itself — a send attempt outside the window must be rejected even if a
// client somehow tries it." Mirrors lib/rewatch/request-rewatch-access.ts's
// shape: pure core decision (@prompt-me/core's evaluateChatSendAccess) +
// mechanical db reads/writes, composed here, `now` threaded through
// explicitly rather than read from an ambient clock so a test controls it
// the same way rewatch's own tests do.
//
// This function is deliberately the ONLY place a chat_messages row gets
// inserted (apps/web/src/app/api/chat/messages/route.ts, the actual
// endpoint, is a thin auth+parsing wrapper around it — same split as
// lib/clips/upload.ts / api/clips/route.ts) — so there is exactly one
// place the window-state check can be bypassed from, and it's this one,
// not the UI.
//
// Realtime delivery (ENGINEERING_SPEC §11: "messages send over Pusher for
// realtime delivery") is deliberately NOT wired here — this slice is the
// window-lifecycle half of M11 (ROADMAP.md); once that half lands, the
// natural place to add a pusher.trigger() call is right after the
// createChatMessage write below succeeds, before returning.
import { evaluateChatSendAccess, type ChatSendAccessDecision } from "@prompt-me/core";
import {
  createChatMessage,
  getChatWindowById,
  getMatchById,
  type AnyDb,
  type ChatMessage,
} from "@prompt-me/db";

export class ChatWindowNotFoundError extends Error {
  constructor(chatWindowId: string) {
    super(`send-message: no chat_windows row id=${chatWindowId}`);
    this.name = "ChatWindowNotFoundError";
  }
}

export class ChatMatchAccessError extends Error {
  constructor(matchId: string, senderId: string) {
    super(`send-message: matchId=${matchId} has no participant senderId=${senderId}`);
    this.name = "ChatMatchAccessError";
  }
}

/**
 * SPEC.md §5: Escape is "the only way out of a live match" — a pair that
 * has escaped/blocked each other must not still be able to send into a
 * window that happened to still be open (the same "active match only"
 * requirement every other match-touching composition point in
 * lib/date-proposals/match-access.ts already enforces).
 */
export class ChatMatchNotActiveError extends Error {
  constructor(matchId: string) {
    super(`send-message: matchId=${matchId} is not active`);
    this.name = "ChatMatchNotActiveError";
  }
}

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
 * then participation, then match-active, then the window-state rule
 * §11 is actually about, then trivial body validity — the same
 * "existence/access before business rule" ordering
 * lib/date-proposals/load-proposal.ts's loadProposalForParticipant already
 * establishes for the sibling date-proposal flows.
 */
export async function sendChatMessage(
  db: AnyDb,
  input: SendChatMessageInput,
  now: Date = new Date(),
): Promise<ChatMessage> {
  const window = await getChatWindowById(db, input.chatWindowId);
  if (!window) {
    throw new ChatWindowNotFoundError(input.chatWindowId);
  }

  const match = await getMatchById(db, window.matchId);
  if (!match || (match.userAId !== input.senderId && match.userBId !== input.senderId)) {
    throw new ChatMatchAccessError(window.matchId, input.senderId);
  }
  if (match.status !== "active") {
    throw new ChatMatchNotActiveError(window.matchId);
  }

  const decision = evaluateChatSendAccess({ opensAt: window.opensAt, closesAt: window.closesAt }, now);
  if (decision.status !== "allowed") {
    throw new ChatWindowNotOpenError(input.chatWindowId, decision);
  }

  if (input.body.trim().length === 0) {
    throw new EmptyChatMessageBodyError();
  }

  return createChatMessage(db, {
    chatWindowId: input.chatWindowId,
    senderId: input.senderId,
    body: input.body,
  });
}
