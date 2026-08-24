// chat_windows lifecycle — ENGINEERING_SPEC.md §11, SPEC.md §8, ROADMAP.md
// M11. Pure, DB-free (mirrors rewatch/access.ts's own split, same file
// header shape): `computeChatWindowTimes` turns a locked date_proposal's
// slotStartAt into the opens_at/closes_at pair §11 defines;
// `evaluateChatSendAccess` turns a persisted chat_windows row + a point in
// time into the send/reject decision the message-send endpoint enforces.
// Composed with the DB by apps/web's lib/date-proposals/set-venue.ts
// (window creation, at the moment a proposal becomes locked) and
// lib/chat/send-message.ts (send enforcement).

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

/** ENGINEERING_SPEC §11: `opens_at = slot_start_at - 60min`. */
export const CHAT_WINDOW_OPENS_BEFORE_MINUTES = 60;

/** ENGINEERING_SPEC §11: `closes_at = slot_start_at + 4h` — the engineering
 * default resolving SPEC.md §8's "a few hours after." */
export const CHAT_WINDOW_CLOSES_AFTER_HOURS = 4;

export interface ChatWindowTimes {
  opensAt: Date;
  closesAt: Date;
}

/**
 * ENGINEERING_SPEC §11, verbatim: `opens_at = slot_start_at - 60min`,
 * `closes_at = slot_start_at + 4h`. Takes only `slotStartAt` — the window
 * is anchored to when the date itself starts, not `slotEndAt` or how long
 * the date is planned to run.
 */
export function computeChatWindowTimes(slotStartAt: Date): ChatWindowTimes {
  return {
    opensAt: new Date(slotStartAt.getTime() - CHAT_WINDOW_OPENS_BEFORE_MINUTES * MINUTE_MS),
    closesAt: new Date(slotStartAt.getTime() + CHAT_WINDOW_CLOSES_AFTER_HOURS * HOUR_MS),
  };
}

export type ChatSendAccessDecision =
  | { status: "allowed" }
  /** `now` is still before `opensAt`. */
  | { status: "not_yet_open"; opensAt: Date; msUntilOpen: number }
  /** `now` is at or past `closesAt`. */
  | { status: "closed"; closedAt: Date };

/**
 * ENGINEERING_SPEC §11: "the window's open/closed state is enforced
 * server-side on the message-send endpoint itself — a send attempt outside
 * the window must be rejected even if a client somehow tries it."
 *
 * `now` is always an explicit parameter, never read from an ambient clock —
 * the same "no hidden global state" shape rewatch/access.ts's
 * evaluateRewatchAccess already gives this codebase's other time-gated
 * rule. `window` is always the chat_windows row's own already-persisted
 * opensAt/closesAt (computed once, at lock time, by computeChatWindowTimes
 * above and never recomputed here) — this function only ever compares
 * `now` against values that already exist in the database, which is what
 * makes a client-side bypass attempt harmless: the endpoint re-derives
 * this decision from the stored row on every request, not from anything
 * the client sends.
 *
 * Boundaries: `now === opensAt` is allowed (the window opens inclusively);
 * `now === closesAt` is already closed (closesAt is exclusive), matching
 * the schema's own `closes_at > opens_at` CHECK and giving the window a
 * definite, non-overlapping instant of closure.
 */
export function evaluateChatSendAccess(window: ChatWindowTimes, now: Date): ChatSendAccessDecision {
  const nowMs = now.getTime();
  const opensAtMs = window.opensAt.getTime();
  const closesAtMs = window.closesAt.getTime();

  if (nowMs < opensAtMs) {
    return { status: "not_yet_open", opensAt: window.opensAt, msUntilOpen: opensAtMs - nowMs };
  }
  if (nowMs >= closesAtMs) {
    return { status: "closed", closedAt: window.closesAt };
  }
  return { status: "allowed" };
}
