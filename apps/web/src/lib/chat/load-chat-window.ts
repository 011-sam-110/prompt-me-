// Shared "does this chat_windows row exist, and is `viewerId` a genuine
// participant in its (still-active) match" guard — factored out of
// send-message.ts so the message-read path (get-chat-messages.ts) and the
// realtime-subscribe route (api/chat/subscribe/[chatWindowId]/route.ts)
// reuse the identical check rather than a third/fourth copy of it, the
// same reasoning lib/date-proposals/load-proposal.ts's own header comment
// gives for its own extraction.
import { getChatWindowById, getMatchById, type AnyDb, type ChatWindow, type Match } from "@prompt-me/db";

export class ChatWindowNotFoundError extends Error {
  constructor(chatWindowId: string) {
    super(`chat: no chat_windows row id=${chatWindowId}`);
    this.name = "ChatWindowNotFoundError";
  }
}

export class ChatMatchAccessError extends Error {
  constructor(matchId: string, viewerId: string) {
    super(`chat: matchId=${matchId} has no participant viewerId=${viewerId}`);
    this.name = "ChatMatchAccessError";
  }
}

/**
 * SPEC.md §5: Escape is "the only way out of a live match" — a pair that
 * has escaped/blocked each other must not still be able to read or send
 * into a window that happened to still be open (the same "active match
 * only" requirement every other match-touching composition point in
 * lib/date-proposals/match-access.ts already enforces).
 */
export class ChatMatchNotActiveError extends Error {
  constructor(matchId: string) {
    super(`chat: matchId=${matchId} is not active`);
    this.name = "ChatMatchNotActiveError";
  }
}

export interface ChatWindowWithMatch {
  window: ChatWindow;
  match: Match;
}

/**
 * Loads a chat_windows row by id and confirms `viewerId` is a participant
 * in its (still-active) match — throws ChatWindowNotFoundError,
 * ChatMatchAccessError, or ChatMatchNotActiveError as appropriate. Returns
 * both rows so callers that also need `match.userAId`/`userBId` (e.g. to
 * derive "the other side" for display — get-chat-messages.ts) don't have
 * to re-fetch it. Does NOT check the window's own opens_at/closes_at —
 * send-message.ts layers @prompt-me/core's evaluateChatSendAccess on top of
 * this for the send path; the read path (get-chat-messages.ts) and the
 * subscribe route deliberately don't, since chat history and the ability
 * to receive a live message stay available after a window closes (only
 * *sending* is gated — packages/db's chat-messages.ts's own comment).
 */
export async function loadChatWindowForParticipant(
  db: AnyDb,
  chatWindowId: string,
  viewerId: string,
): Promise<ChatWindowWithMatch> {
  const window = await getChatWindowById(db, chatWindowId);
  if (!window) {
    throw new ChatWindowNotFoundError(chatWindowId);
  }

  const match = await getMatchById(db, window.matchId);
  if (!match || (match.userAId !== viewerId && match.userBId !== viewerId)) {
    throw new ChatMatchAccessError(window.matchId, viewerId);
  }
  if (match.status !== "active") {
    throw new ChatMatchNotActiveError(window.matchId);
  }

  return { window, match };
}
