// ENGINEERING_SPEC.md §14 / ROADMAP.md M13's clock-driven trigger:
// "chat window opening in 15 minutes." Pure, DB-free — same split as
// window.ts's own evaluateChatSendAccess: `now` is always an explicit
// parameter, `window` is always the chat_windows row's own already-
// persisted opens_at (computed once, at lock time, by computeChatWindowTimes,
// never recomputed here).
//
// Composed with @prompt-me/db by
// apps/web/src/lib/notifications/notify-chat-window-opening.ts: that file's
// sendDueChatWindowOpeningReminders polls every chat_windows row with no
// reminder sent yet (packages/db's getChatWindowsPendingOpeningReminder —
// mechanical only, no time filtering in SQL, same "core decides, db just
// returns candidates" split feed.ts's own header comment documents for the
// 48h denied-profile rule) and keeps only the ones this function says are
// due right now.

const MINUTE_MS = 60 * 1000;

/** ENGINEERING_SPEC §14: "chat window opening in 15 minutes." Named as its
 * own constant, same rationale as chat-windows/window.ts's own
 * CHAT_WINDOW_OPENS_BEFORE_MINUTES — a future revision to the lead time is
 * a one-line change. */
export const CHAT_WINDOW_OPENING_REMINDER_LEAD_MINUTES = 15;

/** The subset of a `chat_windows` row this decision needs — deliberately
 * structural (any object with these two fields works), same shape
 * ../moderation/clip-review.ts's ModerationFlagReviewSnapshot uses for the
 * same reason: a real @prompt-me/db ChatWindow row satisfies this with no
 * adapting required. */
export interface ChatWindowReminderCandidate {
  opensAt: Date;
  /** Null until sendDueChatWindowOpeningReminders has actually sent this
   * window's reminder — see that file's own comment on why the send has to
   * be idempotent across polls. */
  reminderSentAt: Date | null;
}

/**
 * True from `opens_at - 15min` up to (but not including) `opens_at`
 * itself, and only if no reminder has been sent for this window yet.
 *
 * Boundaries mirror evaluateChatSendAccess's own reasoning: `now ===
 * dueAt` (exactly 15 minutes out) counts as due (inclusive lower bound —
 * a poll landing on the exact minute shouldn't miss it), `now ===
 * opensAt` does not (the window has already opened by then; a "opens in
 * 15 minutes" email at that instant would be stale/wrong, not just late).
 * A poll cadence slower than 15 minutes could still skip the window
 * entirely between two polls — that's a deployment/cron-frequency concern
 * (documented in notify-chat-window-opening.ts), not something this pure
 * function can fix by itself.
 */
export function isChatWindowOpeningReminderDue(window: ChatWindowReminderCandidate, now: Date): boolean {
  if (window.reminderSentAt !== null) {
    return false;
  }
  const nowMs = now.getTime();
  const opensAtMs = window.opensAt.getTime();
  const dueAtMs = opensAtMs - CHAT_WINDOW_OPENING_REMINDER_LEAD_MINUTES * MINUTE_MS;
  return nowMs >= dueAtMs && nowMs < opensAtMs;
}
