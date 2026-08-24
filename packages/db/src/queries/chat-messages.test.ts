// ROADMAP.md M11 / ENGINEERING_SPEC.md §11/§12. Same PGlite-against-the-
// real-migration pattern as chat-windows.test.ts. Purely mechanical
// coverage — the actual send/reject decision is @prompt-me/core's
// evaluateChatSendAccess, composed with createChatMessage by apps/web's
// lib/chat/send-message.ts (its own integration test); this file only
// proves the two query functions read/write the right rows.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "../schema";
import { ensureUserForClerkId } from "./users";
import { ensurePromptsSeeded } from "./prompts";
import { insertMatchIfNotExists } from "./matches";
import { acceptDateProposal, createDateProposal } from "./date-proposals";
import { createChatWindowIfNotExists } from "./chat-windows";
import { createChatMessage, getChatMessageById, getChatMessagesForWindow, removeChatMessage } from "./chat-messages";

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../drizzle");
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

const at = (isoTime: string) => new Date(`2026-09-10T${isoTime}:00.000Z`);

describe("chat_messages queries", () => {
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

  async function makeWindow(clerkIdA: string, clerkIdB: string) {
    const a = await ensureUserForClerkId(db, clerkIdA);
    const b = await ensureUserForClerkId(db, clerkIdB);
    const match = await insertMatchIfNotExists(db, { userAId: a.id, userBId: b.id });
    const proposal = await createDateProposal(db, {
      matchId: match.id,
      proposedByUserId: a.id,
      ideaText: "Coffee",
      slotStartAt: at("18:00"),
      slotEndAt: at("19:00"),
    });
    await acceptDateProposal(db, proposal.id);
    const window = await createChatWindowIfNotExists(db, {
      matchId: match.id,
      dateProposalId: proposal.id,
      opensAt: new Date(proposal.slotStartAt.getTime() - 60 * MINUTE_MS),
      closesAt: new Date(proposal.slotStartAt.getTime() + 4 * HOUR_MS),
    });
    return { match, proposal, window, a: a.id, b: b.id };
  }

  it("getChatMessagesForWindow returns an empty list before any message is sent", async () => {
    const { window } = await makeWindow("clerk_cm_empty_a", "clerk_cm_empty_b");
    expect(await getChatMessagesForWindow(db, window.id)).toEqual([]);
  });

  it("createChatMessage persists a row readable back by getChatMessagesForWindow", async () => {
    const { window, a } = await makeWindow("clerk_cm_create_a", "clerk_cm_create_b");

    const created = await createChatMessage(db, {
      chatWindowId: window.id,
      senderId: a,
      body: "Running 5 minutes late, sorry!",
    });

    expect(created.chatWindowId).toBe(window.id);
    expect(created.senderId).toBe(a);
    expect(created.body).toBe("Running 5 minutes late, sorry!");
    expect(created.removedAt).toBeNull();

    const rows = await getChatMessagesForWindow(db, window.id);
    expect(rows.map((r) => r.id)).toEqual([created.id]);
  });

  it("getChatMessagesForWindow returns messages oldest-first and scoped to the one window", async () => {
    const { window: windowA, a: senderA } = await makeWindow("clerk_cm_order_a1", "clerk_cm_order_a2");
    const { window: windowB, a: senderB } = await makeWindow("clerk_cm_order_b1", "clerk_cm_order_b2");

    const first = await createChatMessage(db, { chatWindowId: windowA.id, senderId: senderA, body: "First" });
    const second = await createChatMessage(db, { chatWindowId: windowA.id, senderId: senderA, body: "Second" });
    await createChatMessage(db, { chatWindowId: windowB.id, senderId: senderB, body: "Unrelated window" });

    const rows = await getChatMessagesForWindow(db, windowA.id);
    expect(rows.map((r) => r.id)).toEqual([first.id, second.id]);
  });

  it("getChatMessageById returns the row by id, and undefined for an unknown id", async () => {
    const { window, a } = await makeWindow("clerk_cm_byid_a", "clerk_cm_byid_b");
    const created = await createChatMessage(db, { chatWindowId: window.id, senderId: a, body: "hi" });

    expect(await getChatMessageById(db, created.id)).toEqual(created);
    expect(await getChatMessageById(db, "00000000-0000-0000-0000-000000000000")).toBeUndefined();
  });

  it("removeChatMessage sets removed_at without touching body, and is idempotent", async () => {
    const { window, a } = await makeWindow("clerk_cm_remove_a", "clerk_cm_remove_b");
    const created = await createChatMessage(db, { chatWindowId: window.id, senderId: a, body: "original text" });
    expect(created.removedAt).toBeNull();

    const removedAt = at("20:00");
    const removed = await removeChatMessage(db, created.id, removedAt);
    expect(removed.removedAt?.getTime()).toBe(removedAt.getTime());
    // The soft-removal never scrubs the stored text — ROADMAP.md M12's
    // review record stays intact.
    expect(removed.body).toBe("original text");

    // Idempotent: reviewing (or re-reviewing) the same message again just
    // re-stamps removed_at rather than erroring.
    const secondRemovedAt = at("20:05");
    const removedAgain = await removeChatMessage(db, created.id, secondRemovedAt);
    expect(removedAgain.removedAt?.getTime()).toBe(secondRemovedAt.getTime());

    await expect(removeChatMessage(db, "00000000-0000-0000-0000-000000000000")).rejects.toThrow(
      /no chat_messages row/,
    );
  });
});
