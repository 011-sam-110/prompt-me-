// ENGINEERING_SPEC.md §14's clock-driven trigger: "chat window opening in
// 15 minutes." Unlike the other three notifications (fired inline, right
// after the write that makes them true), this one isn't triggered by any
// single user action — a chat_windows row's opens_at is fixed the moment
// lib/date-proposals/set-venue.ts locks the date, potentially hours or
// days before the window actually opens, so nothing in THAT request is the
// right place to send an email about a LATER point in time.
//
// Instead this is a poll: apps/web/src/app/api/cron/chat-window-reminders/route.ts
// calls sendDueChatWindowOpeningReminders on a schedule (this repo's
// vercel.json cron entry), and it sends exactly the reminders that are due
// right now (@prompt-me/core's isChatWindowOpeningReminderDue), marking
// each chat_windows row's reminder_sent_at so a later poll (or a
// missed/retried one) never double-sends for the same window — the same
// "idempotent write closes the loop" shape createChatWindowIfNotExists
// itself already uses for window creation.
//
// Each window is handled independently, wrapped in its own try/catch: one
// pair with a bad email (or a transient Resend failure) must not stop the
// batch from reaching every other due window in the same poll.
import { getNotificationProvider, isChatWindowOpeningReminderDue, type NotificationEvent } from "@prompt-me/core";
import {
  getChatWindowsPendingOpeningReminder,
  getMatchById,
  getUserById,
  markChatWindowReminderSent,
  type AnyDb,
  type ChatWindow,
} from "@prompt-me/db";
import { resolveRecipientEmail } from "./resolve-recipient-email";

async function sendReminderForWindow(db: AnyDb, window: ChatWindow): Promise<void> {
  const match = await getMatchById(db, window.matchId);
  if (!match) {
    throw new Error(`sendReminderForWindow: chatWindowId=${window.id} references missing matchId=${window.matchId}`);
  }

  const [userA, userB] = await Promise.all([getUserById(db, match.userAId), getUserById(db, match.userBId)]);
  if (!userA || !userB) {
    throw new Error(`sendReminderForWindow: matchId=${match.id} references a missing user`);
  }

  const [emailA, emailB] = await Promise.all([
    resolveRecipientEmail(userA.clerkId),
    resolveRecipientEmail(userB.clerkId),
  ]);

  const provider = getNotificationProvider();
  const events: NotificationEvent[] = [emailA, emailB].map((recipientEmail) => ({
    type: "chat_window_opening_soon",
    recipientEmail,
    matchId: match.id,
    chatWindowId: window.id,
    opensAt: window.opensAt,
  }));
  await Promise.all(events.map((event) => provider.send(event)));
}

/**
 * Sends the "opening in 15 minutes" reminder for every chat_windows row
 * that's due right now, then marks each one's reminder_sent_at = `now` so
 * it's never sent again. Returns the ids it actually sent for (the cron
 * route's own response body, and what tests assert against). A window
 * whose send fails is logged and skipped — it stays pending
 * (reminder_sent_at untouched) so the NEXT poll retries it, rather than
 * silently losing the reminder or aborting every other window in the same
 * batch.
 *
 * `now` defaults to the real clock for production callers (the cron
 * route), and is always overridable by a test — same default-parameter
 * shape as lib/chat/send-message.ts's sendChatMessage /
 * lib/rewatch/request-rewatch-access.ts's requestRewatchAccess.
 */
export async function sendDueChatWindowOpeningReminders(db: AnyDb, now: Date = new Date()): Promise<string[]> {
  const pending = await getChatWindowsPendingOpeningReminder(db);
  const due = pending.filter((window) => isChatWindowOpeningReminderDue(window, now));

  const sentIds: string[] = [];
  for (const window of due) {
    try {
      await sendReminderForWindow(db, window);
      await markChatWindowReminderSent(db, window.id, now);
      sentIds.push(window.id);
    } catch (error) {
      console.error(`sendDueChatWindowOpeningReminders: failed for chatWindowId=${window.id}`, error);
    }
  }
  return sentIds;
}
