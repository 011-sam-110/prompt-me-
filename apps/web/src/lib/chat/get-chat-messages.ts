// Read-path composition for the chat page
// (app/matches/[matchId]/chat/[chatWindowId]/page.tsx) — mirrors
// lib/date-proposals/get-match-proposals.ts's shape: resolve + guard via
// load-chat-window.ts's loadChatWindowForParticipant (the identical
// participant + active-match check send-message.ts's send path uses), then
// read every message oldest-first. Deliberately does NOT gate on the
// window's open/closed state — packages/db's chat-messages.ts's own
// comment: history stays readable after a window closes, only *sending*
// (send-message.ts) is gated by ENGINEERING_SPEC §11.
import { getChatMessagesForWindow, type AnyDb, type ChatMessage, type ChatWindow } from "@prompt-me/db";
import { loadChatWindowForParticipant } from "./load-chat-window";

export interface ChatWindowWithMessages {
  window: ChatWindow;
  messages: ChatMessage[];
  /** The signed-in viewer's match partner — resolved here so callers never
   * have to know about `matches.userAId`/`userBId` themselves, same reason
   * get-match-proposals.ts resolves its own `otherUserId`. */
  otherUserId: string;
}

export async function getChatWindowWithMessages(
  db: AnyDb,
  chatWindowId: string,
  viewerId: string,
): Promise<ChatWindowWithMessages> {
  const { window, match } = await loadChatWindowForParticipant(db, chatWindowId, viewerId);
  const otherUserId = match.userAId === viewerId ? match.userBId : match.userAId;
  const messages = await getChatMessagesForWindow(db, chatWindowId);
  return { window, messages, otherUserId };
}

export { ChatMatchAccessError, ChatMatchNotActiveError, ChatWindowNotFoundError } from "./load-chat-window";
