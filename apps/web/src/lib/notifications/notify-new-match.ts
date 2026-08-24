// ENGINEERING_SPEC.md §14: "Email... for: new match." Composition point —
// lib/matches/check-and-create-match.ts calls this, awaited, the moment
// @prompt-me/db's insertMatchAndReportCreated reports `created: true`,
// never on a repeat call for a pair that already matched (that function's
// own header comment explains why "created" has to be distinguished from
// "already existed": recordClipViewPosition never un-completes a row, so
// checkAndCreateMatchIfMutual keeps re-running against an already-complete
// pair on every later clip_views write for that pair).
//
// Awaited (not fire-and-forget) — same posture lib/chat/send-message.ts's
// own header comment documents for its realtime trigger() call: "a thrown
// error here does propagate to the caller... same posture every other
// adapter call in this codebase takes." A Resend outage failing this
// specific request is an accepted tradeoff, not an oversight — the
// `matches` row it's reporting on has already committed either way, so a
// retried request re-derives the same match rather than losing anything
// (checkAndCreateMatchIfMutual's own idempotency).
import { getNotificationProvider, type NotificationEvent } from "@prompt-me/core";
import { getUserById, type AnyDb, type Match } from "@prompt-me/db";
import { resolveRecipientEmail } from "./resolve-recipient-email";

export class NotifyNewMatchUserNotFoundError extends Error {
  constructor(matchId: string, userId: string) {
    super(`notifyNewMatch: matchId=${matchId} references missing userId=${userId}`);
    this.name = "NotifyNewMatchUserNotFoundError";
  }
}

/** Sends the "you've got a new match" email to BOTH participants. */
export async function notifyNewMatch(db: AnyDb, match: Match): Promise<void> {
  const [userA, userB] = await Promise.all([getUserById(db, match.userAId), getUserById(db, match.userBId)]);
  if (!userA) throw new NotifyNewMatchUserNotFoundError(match.id, match.userAId);
  if (!userB) throw new NotifyNewMatchUserNotFoundError(match.id, match.userBId);

  const [emailA, emailB] = await Promise.all([
    resolveRecipientEmail(userA.clerkId),
    resolveRecipientEmail(userB.clerkId),
  ]);

  const provider = getNotificationProvider();
  const events: NotificationEvent[] = [
    { type: "new_match", recipientEmail: emailA, matchId: match.id },
    { type: "new_match", recipientEmail: emailB, matchId: match.id },
  ];
  await Promise.all(events.map((event) => provider.send(event)));
}
