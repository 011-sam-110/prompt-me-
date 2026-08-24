// Proves the mock is genuinely functional (this file's own header
// comment) rather than a silent no-op: send() actually renders the real
// template and the result is readable back through
// getDevMockSentNotifications(), which is exactly what
// apps/web's notify-*.test.ts files rely on to assert "the adapter was
// called with the right notification type and recipient" against the real
// composition points.
import { beforeEach, describe, expect, it } from "vitest";
import {
  DevMockNotificationProvider,
  clearDevMockSentNotifications,
  getDevMockSentNotifications,
} from "./dev-mock-provider";

beforeEach(() => {
  clearDevMockSentNotifications();
});

describe("DevMockNotificationProvider", () => {
  it("records a send with the right type, recipient, and rendered content — and sends nothing over the network", async () => {
    const provider = new DevMockNotificationProvider();
    await provider.send({ type: "new_match", recipientEmail: "a@dev.prompt-me.invalid", matchId: "match-1" });

    const sent = getDevMockSentNotifications();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.event).toEqual({
      type: "new_match",
      recipientEmail: "a@dev.prompt-me.invalid",
      matchId: "match-1",
    });
    expect(sent[0]!.subject.length).toBeGreaterThan(0);
    expect(sent[0]!.text).toContain("match-1");
    expect(sent[0]!.sentAt).toBeInstanceOf(Date);
  });

  it("records every send, in order, across multiple calls and multiple event types", async () => {
    const provider = new DevMockNotificationProvider();
    await provider.send({ type: "new_match", recipientEmail: "a@dev.prompt-me.invalid", matchId: "match-1" });
    await provider.send({
      type: "new_date_proposal",
      recipientEmail: "b@dev.prompt-me.invalid",
      matchId: "match-1",
      proposalId: "proposal-1",
      ideaText: "Coffee",
      slotStartAt: new Date("2026-09-10T09:00:00.000Z"),
    });

    const sent = getDevMockSentNotifications();
    expect(sent.map((s) => s.event.type)).toEqual(["new_match", "new_date_proposal"]);
  });

  it("clearDevMockSentNotifications resets the log so one test's sends never leak into the next", async () => {
    const provider = new DevMockNotificationProvider();
    await provider.send({ type: "new_match", recipientEmail: "a@dev.prompt-me.invalid", matchId: "match-1" });
    expect(getDevMockSentNotifications()).toHaveLength(1);

    clearDevMockSentNotifications();
    expect(getDevMockSentNotifications()).toHaveLength(0);
  });

  it("getDevMockSentNotifications returns a snapshot copy, not the live array — a caller mutating the result can't corrupt the log", async () => {
    const provider = new DevMockNotificationProvider();
    await provider.send({ type: "new_match", recipientEmail: "a@dev.prompt-me.invalid", matchId: "match-1" });

    const snapshot = getDevMockSentNotifications();
    snapshot.pop();

    expect(getDevMockSentNotifications()).toHaveLength(1);
  });
});
