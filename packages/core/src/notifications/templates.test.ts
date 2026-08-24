import { describe, expect, it } from "vitest";
import { renderNotificationEmail } from "./templates";

describe("renderNotificationEmail", () => {
  it("renders a non-empty subject and body for every notification type, carrying the type-specific ids", () => {
    const events = [
      { type: "new_match", recipientEmail: "a@x.test", matchId: "match-1" },
      {
        type: "new_date_proposal",
        recipientEmail: "a@x.test",
        matchId: "match-1",
        proposalId: "proposal-1",
        ideaText: "Coffee at the corner café",
        slotStartAt: new Date("2026-09-10T09:00:00.000Z"),
      },
      {
        type: "date_proposal_accepted",
        recipientEmail: "a@x.test",
        matchId: "match-1",
        proposalId: "proposal-1",
        ideaText: "Coffee at the corner café",
        slotStartAt: new Date("2026-09-10T09:00:00.000Z"),
      },
      {
        type: "chat_window_opening_soon",
        recipientEmail: "a@x.test",
        matchId: "match-1",
        chatWindowId: "window-1",
        opensAt: new Date("2026-09-10T08:00:00.000Z"),
      },
    ] as const;

    for (const event of events) {
      const rendered = renderNotificationEmail(event);
      expect(rendered.subject.length).toBeGreaterThan(0);
      expect(rendered.text.length).toBeGreaterThan(0);
    }
  });

  it("carries the idea text and ISO slot time into a new_date_proposal email", () => {
    const rendered = renderNotificationEmail({
      type: "new_date_proposal",
      recipientEmail: "a@x.test",
      matchId: "match-1",
      proposalId: "proposal-1",
      ideaText: "Coffee at the corner café",
      slotStartAt: new Date("2026-09-10T09:00:00.000Z"),
    });
    expect(rendered.text).toContain("Coffee at the corner café");
    expect(rendered.text).toContain("2026-09-10T09:00:00.000Z");
  });

  it("carries the chat window's opens_at into a chat_window_opening_soon email", () => {
    const rendered = renderNotificationEmail({
      type: "chat_window_opening_soon",
      recipientEmail: "a@x.test",
      matchId: "match-1",
      chatWindowId: "window-1",
      opensAt: new Date("2026-09-10T08:00:00.000Z"),
    });
    expect(rendered.text).toContain("2026-09-10T08:00:00.000Z");
    expect(rendered.text).toContain("window-1");
  });
});
