import { describe, expect, it } from "vitest";
import {
  CHAT_WINDOW_CLOSES_AFTER_HOURS,
  CHAT_WINDOW_OPENS_BEFORE_MINUTES,
  computeChatWindowTimes,
  evaluateChatSendAccess,
  type ChatWindowTimes,
} from "./window";

const SLOT_START = new Date("2026-09-10T18:00:00.000Z");
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

describe("computeChatWindowTimes", () => {
  it("opens 60 minutes before slotStartAt and closes 4 hours after it, using the named constants rather than duplicated literals", () => {
    const { opensAt, closesAt } = computeChatWindowTimes(SLOT_START);
    expect(opensAt.getTime()).toBe(SLOT_START.getTime() - CHAT_WINDOW_OPENS_BEFORE_MINUTES * MINUTE_MS);
    expect(closesAt.getTime()).toBe(SLOT_START.getTime() + CHAT_WINDOW_CLOSES_AFTER_HOURS * HOUR_MS);
    expect(opensAt.toISOString()).toBe("2026-09-10T17:00:00.000Z");
    expect(closesAt.toISOString()).toBe("2026-09-10T22:00:00.000Z");
  });

  it("is anchored to slotStartAt only — the same window for any slotEndAt", () => {
    // computeChatWindowTimes deliberately takes only one argument; this
    // test documents that a 30-minute date and a 3-hour date starting at
    // the same instant get an identical chat window.
    const { opensAt, closesAt } = computeChatWindowTimes(SLOT_START);
    expect(opensAt.toISOString()).toBe("2026-09-10T17:00:00.000Z");
    expect(closesAt.toISOString()).toBe("2026-09-10T22:00:00.000Z");
  });
});

describe("evaluateChatSendAccess", () => {
  const window: ChatWindowTimes = computeChatWindowTimes(SLOT_START);

  it("rejects as not_yet_open well before the window opens", () => {
    const now = new Date(window.opensAt.getTime() - 30 * MINUTE_MS);
    const decision = evaluateChatSendAccess(window, now);
    expect(decision.status).toBe("not_yet_open");
    if (decision.status !== "not_yet_open") throw new Error("unreachable");
    expect(decision.opensAt.getTime()).toBe(window.opensAt.getTime());
    expect(decision.msUntilOpen).toBe(30 * MINUTE_MS);
  });

  it("rejects as not_yet_open one millisecond before opensAt", () => {
    const now = new Date(window.opensAt.getTime() - 1);
    expect(evaluateChatSendAccess(window, now).status).toBe("not_yet_open");
  });

  it("allows sending at the exact instant the window opens (now === opensAt) — inclusive", () => {
    expect(evaluateChatSendAccess(window, window.opensAt).status).toBe("allowed");
  });

  it("allows sending mid-window", () => {
    const now = new Date(SLOT_START.getTime()); // the date itself, well inside the window
    expect(evaluateChatSendAccess(window, now).status).toBe("allowed");
  });

  it("allows sending one millisecond before closesAt", () => {
    const now = new Date(window.closesAt.getTime() - 1);
    expect(evaluateChatSendAccess(window, now).status).toBe("allowed");
  });

  it("rejects as closed at the exact instant closesAt is reached (now === closesAt) — exclusive", () => {
    const decision = evaluateChatSendAccess(window, window.closesAt);
    expect(decision.status).toBe("closed");
    if (decision.status !== "closed") throw new Error("unreachable");
    expect(decision.closedAt.getTime()).toBe(window.closesAt.getTime());
  });

  it("rejects as closed well after closesAt", () => {
    const now = new Date(window.closesAt.getTime() + 3 * HOUR_MS);
    expect(evaluateChatSendAccess(window, now).status).toBe("closed");
  });

  it("never recomputes opensAt/closesAt from `now` — the same persisted window returns the same boundaries across repeated calls at different times", () => {
    // This is the pure-logic half of ENGINEERING_SPEC §11's server-side
    // guarantee: a client can't widen or reset its own window by re-asking
    // at a later moment, because this function only ever compares `now`
    // against the SAME window object it was handed, never derives new
    // boundaries from `now` itself.
    const early = evaluateChatSendAccess(window, new Date(window.opensAt.getTime() + 1 * MINUTE_MS));
    const late = evaluateChatSendAccess(window, new Date(window.opensAt.getTime() + 90 * MINUTE_MS));
    expect(early.status).toBe("allowed");
    expect(late.status).toBe("allowed");
    // And the window still closes on schedule regardless of how many
    // earlier "allowed" checks happened.
    const afterClose = evaluateChatSendAccess(window, new Date(window.closesAt.getTime() + 1));
    expect(afterClose.status).toBe("closed");
  });
});
