// ROADMAP.md M11's realtime half: the chat page's read path
// (app/matches/[matchId]/chat/[chatWindowId]/page.tsx) needs a locked
// date's full message history, guarded the same way the send path is.
// Same real (PGlite) composition-layer setup as send-message.test.ts's own
// makeLockedDateWithWindow (duplicated here rather than imported — every
// spec file in this codebase's test suites is self-contained, same
// convention that file's own header comment follows).
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@prompt-me/db/schema";
import { ensurePromptsSeeded, ensureUserForClerkId, insertMatchIfNotExists } from "@prompt-me/db";
import { canonicalizeMatchPair } from "@prompt-me/core";
import { proposeDate } from "../date-proposals/propose";
import { acceptDate } from "../date-proposals/respond";
import { setDateVenue } from "../date-proposals/set-venue";
import { escapeMatch } from "../matches/escape-match";
import { sendChatMessage } from "./send-message";
import {
  ChatMatchAccessError,
  ChatMatchNotActiveError,
  ChatWindowNotFoundError,
  getChatWindowWithMessages,
} from "./get-chat-messages";

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../packages/db/drizzle");

const at = (isoTime: string) => new Date(`2026-09-11T${isoTime}:00.000Z`);
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

describe("getChatWindowWithMessages", () => {
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

  async function makeLockedDateWithWindow(clerkIdA: string, clerkIdB: string, slotStartIso: string) {
    const a = await ensureUserForClerkId(db, clerkIdA);
    const b = await ensureUserForClerkId(db, clerkIdB);
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

    return { match, window, a: a.id, b: b.id };
  }

  it("rejects with ChatWindowNotFoundError for a nonexistent chatWindowId", async () => {
    const a = await ensureUserForClerkId(db, "clerk_getmsgs_notfound_a");
    await expect(
      getChatWindowWithMessages(db, "00000000-0000-0000-0000-000000000000", a.id),
    ).rejects.toBeInstanceOf(ChatWindowNotFoundError);
  });

  it("rejects a viewer who isn't a participant in the window's match", async () => {
    const { window } = await makeLockedDateWithWindow("clerk_getmsgs_stranger_a", "clerk_getmsgs_stranger_b", "18:00");
    const stranger = await ensureUserForClerkId(db, "clerk_getmsgs_stranger_outsider");
    await expect(getChatWindowWithMessages(db, window.id, stranger.id)).rejects.toBeInstanceOf(ChatMatchAccessError);
  });

  it("rejects once the match has been Escaped/blocked", async () => {
    const { window, a, b } = await makeLockedDateWithWindow("clerk_getmsgs_escaped_a", "clerk_getmsgs_escaped_b", "18:00");
    await escapeMatch(db, a, b);
    await expect(getChatWindowWithMessages(db, window.id, a)).rejects.toBeInstanceOf(ChatMatchNotActiveError);
  });

  it("returns an empty message list for a freshly-locked window nobody has messaged in yet", async () => {
    const { window, a } = await makeLockedDateWithWindow("clerk_getmsgs_empty_a", "clerk_getmsgs_empty_b", "18:00");
    const result = await getChatWindowWithMessages(db, window.id, a);
    expect(result.messages).toEqual([]);
    expect(result.window.id).toBe(window.id);
  });

  it("resolves otherUserId to the viewer's match partner, from either side", async () => {
    const { window, a, b } = await makeLockedDateWithWindow("clerk_getmsgs_other_a", "clerk_getmsgs_other_b", "18:00");
    expect((await getChatWindowWithMessages(db, window.id, a)).otherUserId).toBe(b);
    expect((await getChatWindowWithMessages(db, window.id, b)).otherUserId).toBe(a);
  });

  it("returns every message oldest-first, from both participants", async () => {
    const { window, a, b } = await makeLockedDateWithWindow("clerk_getmsgs_order_a", "clerk_getmsgs_order_b", "18:00");
    const mid = new Date((window.opensAt.getTime() + window.closesAt.getTime()) / 2);

    await sendChatMessage(db, { chatWindowId: window.id, senderId: a, body: "first" }, window.opensAt);
    await sendChatMessage(db, { chatWindowId: window.id, senderId: b, body: "second" }, mid);
    await sendChatMessage(db, { chatWindowId: window.id, senderId: a, body: "third" }, new Date(window.closesAt.getTime() - 1));

    const result = await getChatWindowWithMessages(db, window.id, b);
    expect(result.messages.map((m) => m.body)).toEqual(["first", "second", "third"]);
  });

  it("still reads message history once closes_at has passed — reading isn't gated like sending is, getChatWindowWithMessages takes no `now` at all", async () => {
    const { window, a } = await makeLockedDateWithWindow("clerk_getmsgs_closed_a", "clerk_getmsgs_closed_b", "18:00");
    await sendChatMessage(db, { chatWindowId: window.id, senderId: a, body: "before it closed" }, window.opensAt);

    const result = await getChatWindowWithMessages(db, window.id, a);
    expect(result.messages.map((m) => m.body)).toEqual(["before it closed"]);
  });
});
