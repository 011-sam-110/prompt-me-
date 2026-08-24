// Pure event -> email-content rendering, shared by both providers
// (resend-provider.ts sends this over the wire; dev-mock-provider.ts logs
// it) so the copy lives in exactly one place rather than being duplicated
// across "what a real send looks like" and "what the mock prints" — the
// same reason record-flags.ts got pulled out once a second caller needed
// identical logic (apps/web/src/lib/moderation/record-flags.ts's own
// header comment).
import type { NotificationEvent } from "./types";

export interface RenderedNotificationEmail {
  subject: string;
  text: string;
}

function formatWhen(at: Date): string {
  // Deterministic, locale-free formatting (no Intl) — this is EMAIL BODY
  // TEXT, not a UI surface bound by Sam's browser-zoom review notes; it
  // just needs to be a stable, testable string. ISO 8601, same as every
  // other timestamp this codebase already surfaces raw (e.g. clip-review
  // decisions, moderation flags).
  return at.toISOString();
}

export function renderNotificationEmail(event: NotificationEvent): RenderedNotificationEmail {
  switch (event.type) {
    case "new_match":
      return {
        subject: "You've got a new match on Prompt Me",
        text: `Someone you both fully watched matched back. Open Prompt Me to start planning a date. (matchId=${event.matchId})`,
      };
    case "new_date_proposal":
      return {
        subject: "New date idea proposed",
        text: `Your match proposed "${event.ideaText}" for ${formatWhen(event.slotStartAt)}. Open Prompt Me to accept or decline. (matchId=${event.matchId}, proposalId=${event.proposalId})`,
      };
    case "date_proposal_accepted":
      return {
        subject: "Your date proposal was accepted",
        text: `Your match accepted "${event.ideaText}" for ${formatWhen(event.slotStartAt)}. Open Prompt Me to lock in a venue. (matchId=${event.matchId}, proposalId=${event.proposalId})`,
      };
    case "chat_window_opening_soon":
      return {
        subject: "Your chat window opens in 15 minutes",
        text: `Your pre-date chat with your match opens at ${formatWhen(event.opensAt)}. Open Prompt Me when it does to say hi before you meet. (matchId=${event.matchId}, chatWindowId=${event.chatWindowId})`,
      };
  }
}
