// chat_windows data access — ENGINEERING_SPEC.md §2/§11, ROADMAP.md M11.
// Mechanical only, same split as every other file in this directory:
// @prompt-me/core's computeChatWindowTimes decides the opens_at/closes_at
// pair, and apps/web's lib/date-proposals/set-venue.ts decides WHEN to
// call this (the moment a proposal becomes locked —
// @prompt-me/core's isDateProposalLocked) — this file only turns an
// already-decided window into SQL.
import { eq } from "drizzle-orm";
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
