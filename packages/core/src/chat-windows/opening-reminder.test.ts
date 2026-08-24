import { describe, expect, it } from "vitest";
import { CHAT_WINDOW_OPENING_REMINDER_LEAD_MINUTES, isChatWindowOpeningReminderDue } from "./opening-reminder";

const OPENS_AT = new Date("2026-09-10T17:00:00.000Z");
const MINUTE_MS = 60 * 1000;

describe("isChatWindowOpeningReminderDue", () => {
  it("is false well before the 15-minute lead (mid-window-planning, nothing due yet)", () => {
    const now = new Date(OPENS_AT.getTime() - 30 * MINUTE_MS);
    expect(isChatWindowOpeningReminderDue({ opensAt: OPENS_AT, reminderSentAt: null }, now)).toBe(false);
  });

  it("is false one millisecond before the 15-minute due instant", () => {
    const dueAt = OPENS_AT.getTime() - CHAT_WINDOW_OPENING_REMINDER_LEAD_MINUTES * MINUTE_MS;
    const now = new Date(dueAt - 1);
    expect(isChatWindowOpeningReminderDue({ opensAt: OPENS_AT, reminderSentAt: null }, now)).toBe(false);
  });

  it("is true at the exact instant 15 minutes before opensAt — inclusive lower bound", () => {
    const dueAt = new Date(OPENS_AT.getTime() - CHAT_WINDOW_OPENING_REMINDER_LEAD_MINUTES * MINUTE_MS);
    expect(isChatWindowOpeningReminderDue({ opensAt: OPENS_AT, reminderSentAt: null }, dueAt)).toBe(true);
  });

  it("is true mid-lead-window (e.g. 7 minutes before opening)", () => {
    const now = new Date(OPENS_AT.getTime() - 7 * MINUTE_MS);
    expect(isChatWindowOpeningReminderDue({ opensAt: OPENS_AT, reminderSentAt: null }, now)).toBe(true);
  });

  it("is true one millisecond before opensAt itself", () => {
    const now = new Date(OPENS_AT.getTime() - 1);
    expect(isChatWindowOpeningReminderDue({ opensAt: OPENS_AT, reminderSentAt: null }, now)).toBe(true);
  });

  it("is false at the exact instant the window opens — exclusive upper bound, the window is already open by then", () => {
    expect(isChatWindowOpeningReminderDue({ opensAt: OPENS_AT, reminderSentAt: null }, OPENS_AT)).toBe(false);
  });

  it("is false well after the window has opened", () => {
    const now = new Date(OPENS_AT.getTime() + 10 * MINUTE_MS);
    expect(isChatWindowOpeningReminderDue({ opensAt: OPENS_AT, reminderSentAt: null }, now)).toBe(false);
  });

  it("is false once reminderSentAt is set, even if `now` is squarely inside the due range — never double-sends", () => {
    const now = new Date(OPENS_AT.getTime() - 7 * MINUTE_MS);
    const reminderSentAt = new Date(OPENS_AT.getTime() - 14 * MINUTE_MS);
    expect(isChatWindowOpeningReminderDue({ opensAt: OPENS_AT, reminderSentAt }, now)).toBe(false);
  });
});
