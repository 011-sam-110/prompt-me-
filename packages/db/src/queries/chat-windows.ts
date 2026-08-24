// chat_windows data access — ENGINEERING_SPEC.md §2/§11, ROADMAP.md M11.
// Mechanical only, same split as every other file in this directory:
// @prompt-me/core's computeChatWindowTimes decides the opens_at/closes_at
// pair, and apps/web's lib/date-proposals/set-venue.ts decides WHEN to
// call this (the moment a proposal becomes locked —
// @prompt-me/core's isDateProposalLocked) — this file only turns an
// already-decided window into SQL.
import { eq, isNull } from "drizzle-orm";
import { chatWindows, type ChatWindow } from "../schema/chat-windows";
import type { AnyDb } from "../types";

export interface CreateChatWindowInput {
  matchId: string;
  dateProposalId: string;
  /** Always @prompt-me/core's computeChatWindowTimes output — this file
   * never derives opens_at/closes_at itself. */
  opensAt: Date;
  closesAt: Date;
}

/**
 * Idempotent insert against `chat_windows_date_proposal_idx`
 * (schema/chat-windows.ts) — same "onConflictDoNothing, then select the
 * row that already exists" shape as queries/matches.ts's
 * insertMatchIfNotExists. Needed because setDateProposalVenue's own WHERE
 * clause (queries/date-proposals.ts) only requires `status = "accepted"`,
 * not "venue not already set": either participant can re-run setDateVenue
 * to change their mind about the place after a date is already locked,
 * which calls this function again for the same proposal. This
 * idempotency is what keeps a changed-venue re-call from opening (or
 * resetting) a second window for a proposal that already has one —
 * schema/chat-windows.ts's own header comment: "each locked date gets
 * exactly one window."
 */
export async function createChatWindowIfNotExists(db: AnyDb, input: CreateChatWindowInput): Promise<ChatWindow> {
  const inserted = await db
    .insert(chatWindows)
    .values({
      matchId: input.matchId,
      dateProposalId: input.dateProposalId,
      opensAt: input.opensAt,
      closesAt: input.closesAt,
    })
    .onConflictDoNothing({ target: chatWindows.dateProposalId })
    .returning();

  if (inserted[0]) {
    return inserted[0];
  }

  const [existing] = await db.select().from(chatWindows).where(eq(chatWindows.dateProposalId, input.dateProposalId));
  if (!existing) {
    // Only reachable if the row were deleted between the conflicting
    // insert and this select — surfaces loudly rather than silently
    // returning undefined to the caller (mirrors insertMatchIfNotExists).
    throw new Error(
      `createChatWindowIfNotExists: insert conflicted but no row was found for dateProposalId=${input.dateProposalId}`,
    );
  }
  return existing;
}

/**
 * A single `chat_windows` row by its own id — lib/chat/send-message.ts
 * uses this to load the window a send request targets, before evaluating
 * @prompt-me/core's evaluateChatSendAccess against it.
 */
export async function getChatWindowById(db: AnyDb, chatWindowId: string): Promise<ChatWindow | undefined> {
  const [row] = await db.select().from(chatWindows).where(eq(chatWindows.id, chatWindowId));
  return row;
}

/**
 * The chat_windows row for a given date_proposal, or undefined if that
 * proposal was never locked (or hasn't been yet). At most one row can ever
 * match — `chat_windows_date_proposal_idx` guarantees it.
 */
export async function getChatWindowByProposalId(db: AnyDb, dateProposalId: string): Promise<ChatWindow | undefined> {
  const [row] = await db.select().from(chatWindows).where(eq(chatWindows.dateProposalId, dateProposalId));
  return row;
}

/**
 * ROADMAP.md M13 / ENGINEERING_SPEC §14: every chat_windows row that has
 * never had its "opening in 15 minutes" reminder sent — mechanical only,
 * same "no time filtering in SQL" split queries/feed.ts's own header
 * comment documents for its 48h-resurfacing rule: whether any of these
 * rows is actually DUE right now is @prompt-me/core's
 * isChatWindowOpeningReminderDue's job, applied by the caller
 * (apps/web/src/lib/notifications/notify-chat-window-opening.ts's
 * sendDueChatWindowOpeningReminders), not this query's. A row already past
 * its opens_at with no reminder ever sent is deliberately still returned
 * here — isChatWindowOpeningReminderDue itself is what correctly treats an
 * already-opened window as no-longer-due, so it's harmless (and simpler)
 * to let this query stay a single unconditional filter rather than
 * duplicating that boundary in SQL too.
 */
export async function getChatWindowsPendingOpeningReminder(db: AnyDb): Promise<ChatWindow[]> {
  return db.select().from(chatWindows).where(isNull(chatWindows.reminderSentAt));
}

/**
 * Marks one chat_windows row's reminder as sent — the write that makes
 * getChatWindowsPendingOpeningReminder stop returning it, and the write
 * that guarantees sendDueChatWindowOpeningReminders never sends the same
 * window's "opening in 15 minutes" email twice, even across overlapping or
 * retried polls.
 */
export async function markChatWindowReminderSent(db: AnyDb, chatWindowId: string, sentAt: Date): Promise<ChatWindow> {
  const [updated] = await db
    .update(chatWindows)
    .set({ reminderSentAt: sentAt })
    .where(eq(chatWindows.id, chatWindowId))
    .returning();
  if (!updated) {
    throw new Error(`markChatWindowReminderSent: no chat_windows row found for id=${chatWindowId}`);
  }
  return updated;
}
