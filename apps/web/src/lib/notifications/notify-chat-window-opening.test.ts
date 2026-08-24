// ROADMAP.md M13: "Email fires for: ... chat window opening in 15
// minutes." Exercises the real composition point
// (sendDueChatWindowOpeningReminders) against a real chat_windows row
// (created the same way lib/date-proposals/set-venue.ts creates one) with
// a mocked clock — same "verified with mocked clock" bar
// ROADMAP.md M8/M6 already set for their own time-gated rules.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@prompt-me/db/schema";
import {
  acceptDateProposal,
  createChatWindowIfNotExists,
  createDateProposal,
  ensurePromptsSeeded,
  ensureUserForClerkId,
  getChatWindowByProposalId,
  insertMatchIfNotExists,
} from "@prompt-me/db";
import { clearDevMockSentNotifications, getDevMockSentNotifications } from "@prompt-me/core";
import { sendDueChatWindowOpeningReminders } from "./notify-chat-window-opening";

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../packages/db/drizzle");

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const SLOT_START = new Date("2026-09-10T18:00:00.000Z");

describe("sendDueChatWindowOpeningReminders", () => {
  let client: PGlite;
  let db: PgliteDatabase<typeof schema>;

  beforeAll(async () => {
    client = new PGlite();
    db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder });
    await ensurePromptsSeeded(db);
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(() => {
    clearDevMockSentNotifications();
  });

  async function makeLockedDateWindow(clerkIdA: string, clerkIdB: string, slotStartAt: Date) {
    const a = await ensureUserForClerkId(db, clerkIdA);
    const b = await ensureUserForClerkId(db, clerkIdB);
    const match = await insertMatchIfNotExists(db, { userAId: a.id, userBId: b.id });
    const proposal = await createDateProposal(db, {
      matchId: match.id,
      proposedByUserId: a.id,
      ideaText: "Coffee",
      slotStartAt,
      slotEndAt: new Date(slotStartAt.getTime() + HOUR_MS),
    });
    await acceptDateProposal(db, proposal.id);
    const opensAt = new Date(slotStartAt.getTime() - 60 * MINUTE_MS);
    const closesAt = new Date(slotStartAt.getTime() + 4 * HOUR_MS);
    const window = await createChatWindowIfNotExists(db, {
      matchId: match.id,
      dateProposalId: proposal.id,
      opensAt,
      closesAt,
    });
    return { window, match, a, b };
  }

  it("does nothing for a window whose opens_at is more than 15 minutes away", async () => {
    const { window } = await makeLockedDateWindow("clerk_notify_cw_early_a", "clerk_notify_cw_early_b", SLOT_START);
    const now = new Date(window.opensAt.getTime() - 30 * MINUTE_MS);

    const sentIds = await sendDueChatWindowOpeningReminders(db, now);

    expect(sentIds).not.toContain(window.id);
    expect(getDevMockSentNotifications()).toHaveLength(0);
  });

  it("sends to BOTH participants, type=chat_window_opening_soon, when now is within the 15-minute lead", async () => {
    const { window, match, a, b } = await makeLockedDateWindow(
      "clerk_notify_cw_due_a",
      "clerk_notify_cw_due_b",
      new Date(SLOT_START.getTime() + HOUR_MS),
    );
    const now = new Date(window.opensAt.getTime() - 10 * MINUTE_MS); // 10 min out, inside the 15-min lead

    const sentIds = await sendDueChatWindowOpeningReminders(db, now);

    expect(sentIds).toEqual([window.id]);
    const sent = getDevMockSentNotifications().filter((s) => s.event.type === "chat_window_opening_soon");
    expect(sent).toHaveLength(2);
    const recipients = sent.map((s) => s.event.recipientEmail).sort();
    expect(recipients).toEqual(
      [`${a.clerkId}@dev.prompt-me.invalid`, `${b.clerkId}@dev.prompt-me.invalid`].sort(),
    );
    for (const s of sent) {
      expect(s.event).toMatchObject({ matchId: match.id, chatWindowId: window.id });
    }
  });

  it("marks reminder_sent_at, and a second poll never sends again for the same window (idempotent across polls)", async () => {
    const { window } = await makeLockedDateWindow(
      "clerk_notify_cw_idempotent_a",
      "clerk_notify_cw_idempotent_b",
      new Date(SLOT_START.getTime() + 2 * HOUR_MS),
    );
    const dueAt = new Date(window.opensAt.getTime() - 5 * MINUTE_MS);

    const first = await sendDueChatWindowOpeningReminders(db, dueAt);
    expect(first).toEqual([window.id]);

    const persisted = await getChatWindowByProposalId(db, window.dateProposalId);
    expect(persisted?.reminderSentAt).not.toBeNull();

    clearDevMockSentNotifications();
    const secondPollSameInstant = await sendDueChatWindowOpeningReminders(db, dueAt);
    expect(secondPollSameInstant).toEqual([]);
    expect(getDevMockSentNotifications()).toHaveLength(0);

    // And a LATER poll, still before opens_at, doesn't re-send either.
    const laterStillBeforeOpen = new Date(window.opensAt.getTime() - 1 * MINUTE_MS);
    const thirdPoll = await sendDueChatWindowOpeningReminders(db, laterStillBeforeOpen);
    expect(thirdPoll).toEqual([]);
    expect(getDevMockSentNotifications()).toHaveLength(0);
  });

  it("does nothing once the window has already opened", async () => {
    const { window } = await makeLockedDateWindow(
      "clerk_notify_cw_open_a",
      "clerk_notify_cw_open_b",
      new Date(SLOT_START.getTime() + 3 * HOUR_MS),
    );
    const now = window.opensAt;

    const sentIds = await sendDueChatWindowOpeningReminders(db, now);
    expect(sentIds).not.toContain(window.id);
  });

  it("two independent due windows in the same poll each get sent, isolated from each other", async () => {
    const slotA = new Date(SLOT_START.getTime() + 5 * HOUR_MS);
    const slotB = new Date(SLOT_START.getTime() + 6 * HOUR_MS);
    const { window: windowA } = await makeLockedDateWindow("clerk_notify_cw_multi_a1", "clerk_notify_cw_multi_a2", slotA);
    const { window: windowB } = await makeLockedDateWindow("clerk_notify_cw_multi_b1", "clerk_notify_cw_multi_b2", slotB);

    // windowA is 10 minutes from opening; windowB is far off (opens ~1h
    // after windowA's opens_at) — only windowA should be due.
    const now = new Date(windowA.opensAt.getTime() - 10 * MINUTE_MS);
    const sentIds = await sendDueChatWindowOpeningReminders(db, now);

    expect(sentIds).toEqual([windowA.id]);
    expect(sentIds).not.toContain(windowB.id);
  });
});
