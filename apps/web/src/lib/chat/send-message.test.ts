// ROADMAP.md M11: "Chat window opens/closes server-side per the T-60min /
// +4h rule — message-send is rejected outside the window even if the UI
// is somehow bypassed." Real composition layer against a real (PGlite)
// database, same pattern as lib/date-proposals/set-venue.test.ts: propose
// -> accept -> setDateVenue to reach a genuinely locked date (and the real
// chat_windows row set-venue.ts creates for it), then exercise
// sendChatMessage directly against that row at different `now`s — proving
// the enforcement happens against the window's own persisted
// opens_at/closes_at, not anything a caller passes in.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@prompt-me/db/schema";
import { ensurePromptsSeeded, ensureUserForClerkId, insertMatchIfNotExists } from "@prompt-me/db";
import {
  canonicalizeMatchPair,
  CHAT_MESSAGE_EVENT,
  chatWindowChannelName,
  computeChatWindowTimes,
  subscribeDevMockChannel,
} from "@prompt-me/core";
import { proposeDate } from "../date-proposals/propose";
import { acceptDate } from "../date-proposals/respond";
import { setDateVenue } from "../date-proposals/set-venue";
import { escapeMatch } from "../matches/escape-match";
import {
  ChatMatchAccessError,
  ChatMatchNotActiveError,
  ChatWindowNotFoundError,
  ChatWindowNotOpenError,
  EmptyChatMessageBodyError,
  sendChatMessage,
} from "./send-message";

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../packages/db/drizzle");

const at = (isoTime: string) => new Date(`2026-09-10T${isoTime}:00.000Z`);
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

describe("sendChatMessage", () => {
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

  /** Proposes, accepts, and venues a date so it's genuinely locked and has
   * a real chat_windows row — the same three-step flow
   * set-venue.test.ts's own makeMatch + propose/accept/setDateVenue
   * sequence already exercises. */
  async function makeLockedDateWithWindow(clerkIdA: string, clerkIdB: string, slotStartIso: string) {
    const a = await ensureUserForClerkId(db, clerkIdA);
    const b = await ensureUserForClerkId(db, clerkIdB);
    // Canonicalized before insertMatchIfNotExists — same "mirror what
    // production actually does" reasoning escape-match.test.ts's own
    // makeMatch helper gives, needed here because this file's own Escape
    // test resolves back onto this row via canonicalizeMatchPair too.
    const { userAId, userBId } = canonicalizeMatchPair(a.id, b.id);
    const match = await insertMatchIfNotExists(db, { userAId, userBId });
    const slotStartAt = at(slotStartIso);
    const proposal = await proposeDate(db, match.id, a.id, {
      ideaText: "Coffee at the corner café",
      slotStartAt,
      slotEndAt: new Date(slotStartAt.getTime() + HOUR_MS),
    });

    await acceptDate(db, proposal.id, b.id);
    const locked = await setDateVenue(db, proposal.id, b.id, "dev-mock-place-corner-cafe");

    const [window] = await db
      .select()
      .from(schema.chatWindows)
      .where(eq(schema.chatWindows.dateProposalId, locked.id));
    if (!window) throw new Error("test setup: expected setDateVenue to have created a chat_windows row");

    return { match, proposal: locked, window, a: a.id, b: b.id };
  }

  it("rejects with ChatWindowNotFoundError for a nonexistent chatWindowId", async () => {
    const a = await ensureUserForClerkId(db, "clerk_send_notfound_a");
    await expect(
      sendChatMessage(db, { chatWindowId: "00000000-0000-0000-0000-000000000000", senderId: a.id, body: "hi" }),
    ).rejects.toBeInstanceOf(ChatWindowNotFoundError);
  });

  it("rejects a sender who isn't a participant in the window's match", async () => {
    const { window } = await makeLockedDateWithWindow("clerk_send_stranger_a", "clerk_send_stranger_b", "18:00");
    const stranger = await ensureUserForClerkId(db, "clerk_send_stranger_outsider");

    const now = window.opensAt; // otherwise-valid time, isolating the access check
    await expect(sendChatMessage(db, { chatWindowId: window.id, senderId: stranger.id, body: "hi" }, now)).rejects.toBeInstanceOf(
      ChatMatchAccessError,
    );
  });

  it("rejects sending once the match has been Escaped/blocked, even mid-window", async () => {
    const { match, window, a, b } = await makeLockedDateWithWindow(
      "clerk_send_escaped_a",
      "clerk_send_escaped_b",
      "18:00",
    );
    await escapeMatch(db, a, b);

    const now = window.opensAt;
    await expect(sendChatMessage(db, { chatWindowId: window.id, senderId: a, body: "hi" }, now)).rejects.toBeInstanceOf(
      ChatMatchNotActiveError,
    );
    void match;
  });

  it("rejects as not-yet-open before opens_at, even one millisecond before", async () => {
    const { window, a } = await makeLockedDateWithWindow("clerk_send_early_a", "clerk_send_early_b", "18:00");

    const wayEarly = new Date(window.opensAt.getTime() - 30 * MINUTE_MS);
    await expect(sendChatMessage(db, { chatWindowId: window.id, senderId: a, body: "too early" }, wayEarly)).rejects.toBeInstanceOf(
      ChatWindowNotOpenError,
    );

    const oneMsEarly = new Date(window.opensAt.getTime() - 1);
    await expect(
      sendChatMessage(db, { chatWindowId: window.id, senderId: a, body: "still too early" }, oneMsEarly),
    ).rejects.toBeInstanceOf(ChatWindowNotOpenError);
  });

  it("allows sending at the exact instant the window opens, and persists the message", async () => {
    const { window, a } = await makeLockedDateWithWindow("clerk_send_open_a", "clerk_send_open_b", "18:00");

    const message = await sendChatMessage(
      db,
      { chatWindowId: window.id, senderId: a, body: "Looking forward to it!" },
      window.opensAt,
    );

    expect(message.chatWindowId).toBe(window.id);
    expect(message.senderId).toBe(a);
    expect(message.body).toBe("Looking forward to it!");

    const rows = await db.select().from(schema.chatMessages).where(eq(schema.chatMessages.chatWindowId, window.id));
    expect(rows.map((r) => r.id)).toContain(message.id);
  });

  it("allows sending mid-window and one millisecond before closes_at", async () => {
    const { window, b } = await makeLockedDateWithWindow("clerk_send_mid_a", "clerk_send_mid_b", "18:00");

    const mid = new Date((window.opensAt.getTime() + window.closesAt.getTime()) / 2);
    await expect(sendChatMessage(db, { chatWindowId: window.id, senderId: b, body: "on my way" }, mid)).resolves.toBeDefined();

    const justBeforeClose = new Date(window.closesAt.getTime() - 1);
    await expect(
      sendChatMessage(db, { chatWindowId: window.id, senderId: b, body: "almost there" }, justBeforeClose),
    ).resolves.toBeDefined();
  });

  it("rejects as closed at the exact instant closes_at is reached, and well after", async () => {
    const { window, a } = await makeLockedDateWithWindow("clerk_send_closed_a", "clerk_send_closed_b", "18:00");

    await expect(
      sendChatMessage(db, { chatWindowId: window.id, senderId: a, body: "still trying" }, window.closesAt),
    ).rejects.toBeInstanceOf(ChatWindowNotOpenError);

    const wellAfter = new Date(window.closesAt.getTime() + 3 * HOUR_MS);
    await expect(
      sendChatMessage(db, { chatWindowId: window.id, senderId: a, body: "way too late" }, wellAfter),
    ).rejects.toBeInstanceOf(ChatWindowNotOpenError);
  });

  it("enforcement reads the window's own persisted opens_at/closes_at — matches @prompt-me/core's computeChatWindowTimes exactly", async () => {
    // ENGINEERING_SPEC §11: the endpoint must reject a send outside the
    // window "even if a client somehow tries it" — this proves the row
    // set-venue.ts actually persisted matches what the pure function would
    // derive, i.e. sendChatMessage's decision is grounded in real stored
    // data, not a value a caller could otherwise influence.
    const { window } = await makeLockedDateWithWindow("clerk_send_realclock_a", "clerk_send_realclock_b", "18:00");
    const expected = computeChatWindowTimes(at("18:00"));
    expect(window.opensAt.getTime()).toBe(expected.opensAt.getTime());
    expect(window.closesAt.getTime()).toBe(expected.closesAt.getTime());
  });

  it("publishes the new message over the realtime bus after persisting it (this milestone's realtime half — no PUSHER_* set in this test env, so @prompt-me/core's getRealtimeProvider() resolves to the in-memory dev-mock)", async () => {
    const { window, a } = await makeLockedDateWithWindow("clerk_send_realtime_a", "clerk_send_realtime_b", "18:00");

    const received: unknown[] = [];
    const unsubscribe = subscribeDevMockChannel(chatWindowChannelName(window.id), (evt) => {
      received.push(evt);
    });

    const message = await sendChatMessage(
      db,
      { chatWindowId: window.id, senderId: a, body: "hello over realtime" },
      window.opensAt,
    );
    unsubscribe();

    expect(received).toEqual([{ event: CHAT_MESSAGE_EVENT, payload: { message } }]);
  });

  it("never publishes anything when the send itself is rejected (too early)", async () => {
    const { window, a } = await makeLockedDateWithWindow("clerk_send_realtime_reject_a", "clerk_send_realtime_reject_b", "18:00");

    const received: unknown[] = [];
    const unsubscribe = subscribeDevMockChannel(chatWindowChannelName(window.id), (evt) => {
      received.push(evt);
    });

    const wayEarly = new Date(window.opensAt.getTime() - 30 * MINUTE_MS);
    await expect(
      sendChatMessage(db, { chatWindowId: window.id, senderId: a, body: "too early" }, wayEarly),
    ).rejects.toBeInstanceOf(ChatWindowNotOpenError);
    unsubscribe();

    expect(received).toEqual([]);
  });

  it("rejects an empty or whitespace-only body even mid-window", async () => {
    const { window, a } = await makeLockedDateWithWindow("clerk_send_empty_a", "clerk_send_empty_b", "18:00");
    const mid = new Date((window.opensAt.getTime() + window.closesAt.getTime()) / 2);

    await expect(sendChatMessage(db, { chatWindowId: window.id, senderId: a, body: "" }, mid)).rejects.toBeInstanceOf(
      EmptyChatMessageBodyError,
    );
    await expect(sendChatMessage(db, { chatWindowId: window.id, senderId: a, body: "   " }, mid)).rejects.toBeInstanceOf(
      EmptyChatMessageBodyError,
    );
  });
});
