// ENGINEERING_SPEC.md §14: "Email (via Resend) for: new match, new date
// proposal, proposal accepted, chat window opening in 15 minutes." Same
// adapter shape as every other external integration in this package
// (verification, moderation, transcription, storage, places, date-ideas,
// realtime) — one small interface, a dev-mock (dev-mock-provider.ts) and a
// real implementation (resend-provider.ts), selected by get-provider.ts
// based on config.ts's isResendConfigured().
//
// This module is deliberately Clerk-free: `recipientEmail` arrives already
// resolved. Resolving a users.id / clerk_id down to an actual email address
// (real Clerk lookup, or a deterministic dev-mock address when Clerk isn't
// configured either) is apps/web's job — apps/web/src/lib/notifications/resolve-recipient-email.ts
// — the same "packages/core never imports Next.js/Clerk, apps/web composes"
// boundary every other domain in this package already keeps (e.g. this
// package's chat-windows knows nothing about `AnyDb` either).
export type NotificationType =
  | "new_match"
  | "new_date_proposal"
  | "date_proposal_accepted"
  | "chat_window_opening_soon";

interface BaseNotificationEvent {
  recipientEmail: string;
}

/** ROADMAP.md M7: fired once, only on the write that actually creates a
 * `matches` row — never on a repeat call for a pair that already matched
 * (see @prompt-me/db's insertMatchAndReportCreated). Sent to BOTH sides of
 * the pair. */
export interface NewMatchNotificationEvent extends BaseNotificationEvent {
  type: "new_match";
  matchId: string;
}

/** ROADMAP.md M9/M10: fired the moment a `date_proposals` row is created,
 * regardless of whether the idea came from lib/date-proposals/propose.ts's
 * custom-text path or lib/date-ideas/propose-generated.ts's generated-idea
 * path — SPEC.md draws no distinction between the two once proposed.
 * Sent only to the *other* participant, never back to the proposer. */
export interface NewDateProposalNotificationEvent extends BaseNotificationEvent {
  type: "new_date_proposal";
  matchId: string;
  proposalId: string;
  ideaText: string;
  slotStartAt: Date;
}

/** ROADMAP.md M9: fired when the *other* participant accepts idea+slot
 * (lib/date-proposals/respond.ts's acceptDate) — never on decline, per
 * ENGINEERING_SPEC §14's own list naming only "proposal accepted". Sent to
 * the original proposer, telling them their proposal was accepted. */
export interface DateProposalAcceptedNotificationEvent extends BaseNotificationEvent {
  type: "date_proposal_accepted";
  matchId: string;
  proposalId: string;
  ideaText: string;
  slotStartAt: Date;
}

/** ROADMAP.md M13's own clock-driven trigger: fired once per chat_windows
 * row, ~15 minutes before `opens_at`, by the poll in
 * apps/web/src/lib/notifications/notify-chat-window-opening.ts — never
 * inline with the write that created the window (opens_at can be hours or
 * days in the future at that point). Sent to BOTH participants. */
export interface ChatWindowOpeningSoonNotificationEvent extends BaseNotificationEvent {
  type: "chat_window_opening_soon";
  matchId: string;
  chatWindowId: string;
  opensAt: Date;
}

export type NotificationEvent =
  | NewMatchNotificationEvent
  | NewDateProposalNotificationEvent
  | DateProposalAcceptedNotificationEvent
  | ChatWindowOpeningSoonNotificationEvent;

/** ENGINEERING_SPEC §14's adapter: two implementations — a deterministic,
 * genuinely-functional dev-mock (dev-mock-provider.ts, the one the whole
 * test suite runs against — CLAUDE.md's "missing credentials never block a
 * build") and a real Resend-backed one (resend-provider.ts) — selected by
 * get-provider.ts based on whether real Resend credentials are configured
 * (config.ts). */
export interface NotificationProvider {
  send(event: NotificationEvent): Promise<void>;
}
