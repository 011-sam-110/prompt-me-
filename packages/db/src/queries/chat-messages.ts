// chat_messages data access — ENGINEERING_SPEC.md §2/§11/§12, ROADMAP.md
// M11. Mechanical only, same split as every other file in this directory:
// the actual "is a send allowed right now" decision is @prompt-me/core's
// evaluateChatSendAccess, composed with this file's createChatMessage by
// apps/web's lib/chat/send-message.ts — this file does no window-state
// checking of its own, an unconditional insert once the composition layer
// has already decided the send is allowed (same "core decides, db
// persists" split as queries/rewatch-sessions.ts's createRewatchSession).
import { asc, eq } from "drizzle-orm";
import { chatMessages, type ChatMessage } from "../schema/chat-messages";
import type { AnyDb } from "../types";

export interface CreateChatMessageInput {
  chatWindowId: string;
  senderId: string;
  body: string;
}

export async function createChatMessage(db: AnyDb, input: CreateChatMessageInput): Promise<ChatMessage> {
  const [row] = await db
    .insert(chatMessages)
    .values({ chatWindowId: input.chatWindowId, senderId: input.senderId, body: input.body })
    .returning();
  if (!row) {
    throw new Error(`createChatMessage: insert returned no row for chatWindowId=${input.chatWindowId}`);
  }
  return row;
}

/**
 * Every message in a window, oldest first — the natural read order for a
 * chat thread. Deliberately NOT gated by the window's open/closed state:
 * ENGINEERING_SPEC §13's 90-day post-close retention implies a closed
 * window's history stays readable, only *sending* into it is what §11
 * gates — see lib/chat/send-message.ts.
 */
export async function getChatMessagesForWindow(db: AnyDb, chatWindowId: string): Promise<ChatMessage[]> {
  return db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.chatWindowId, chatWindowId))
    .orderBy(asc(chatMessages.sentAt));
}

/** Fetches one message by id — apps/web's lib/moderation/review-flag.ts
 * looks a flagged message back up before soft-removing it. */
export async function getChatMessageById(db: AnyDb, chatMessageId: string): Promise<ChatMessage | undefined> {
  const [row] = await db.select().from(chatMessages).where(eq(chatMessages.id, chatMessageId));
  return row;
}

/**
 * The human-review "take down" action for a chat message (ROADMAP.md M12,
 * ENGINEERING_SPEC §12) — sets `removed_at`, never deletes the row.
 * Idempotent: re-removing an already-removed message just re-stamps
 * `removed_at` with the current call's `now` rather than erroring, the
 * same "safe to call more than once, no queue guarantees at-most-once"
 * posture lib/clips/process-clip.ts documents for its own writes.
 */
export async function removeChatMessage(db: AnyDb, chatMessageId: string, now: Date = new Date()): Promise<ChatMessage> {
  const [row] = await db
    .update(chatMessages)
    .set({ removedAt: now })
    .where(eq(chatMessages.id, chatMessageId))
    .returning();
  if (!row) {
    throw new Error(`removeChatMessage: no chat_messages row for id=${chatMessageId}`);
  }
  return row;
}
