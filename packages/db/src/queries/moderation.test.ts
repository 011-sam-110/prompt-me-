// ROADMAP.md M4/M12: moderation_flags data access. Same
// PGlite-against-the-real-migration pattern as clips.test.ts.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "../schema";
import { acceptDateProposal, createDateProposal } from "./date-proposals";
import { createChatWindowIfNotExists } from "./chat-windows";
import { createChatMessage } from "./chat-messages";
import { insertClip } from "./clips";
import { insertMatchIfNotExists } from "./matches";
import {
  getModerationFlagById,
  getModerationFlagsForChatMessage,
  getModerationFlagsForClip,
  getPendingChatModerationFlags,
  getPendingClipModerationFlags,
  insertModerationFlag,
  markModerationFlagReviewed,
} from "./moderation";
import { ensurePromptsSeeded } from "./prompts";
import { ensureUserForClerkId } from "./users";

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../drizzle");
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const at = (isoTime: string) => new Date(`2026-09-10T${isoTime}:00.000Z`);

describe("moderation_flags queries", () => {
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

  /** A real chat_messages row to flag against — same three-step
   * match/proposal/window setup queries/chat-messages.test.ts's own
   * makeWindow helper uses. */
  async function makeMessage(clerkIdA: string, clerkIdB: string, body: string) {
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
    return createChatMessage(db, { chatWindowId: window.id, senderId: a.id, body });
  }

  it("insertModerationFlag writes one row against a clip, defaulting reviewed to false", async () => {
    const user = await ensureUserForClerkId(db, "clerk_modflag_insert");
    const clip = await insertClip(db, {
      userId: user.id,
      tier: 1,
      durationSeconds: 15,
      storageUrl: "dev-blob://clips/modflag/tier-1.wav",
      customPromptText: "x",
    });

    const flag = await insertModerationFlag(db, { clipId: clip.id, flagType: "sexual", confidence: 0.82 });
    expect(flag.clipId).toBe(clip.id);
    expect(flag.flagType).toBe("sexual");
    expect(flag.confidence).toBeCloseTo(0.82, 5);
    expect(flag.reviewed).toBe(false);
    expect(flag.actionTaken).toBeNull();
  });

  it("getModerationFlagsForClip returns every flag recorded against that clip, and none for a clean one", async () => {
    const user = await ensureUserForClerkId(db, "clerk_modflag_multi");
    const flaggedClip = await insertClip(db, {
      userId: user.id,
      tier: 2,
      durationSeconds: 30,
      storageUrl: "dev-blob://clips/modflag/tier-2.webm",
      customPromptText: "y",
    });
    const cleanClip = await insertClip(db, {
      userId: user.id,
      tier: 3,
      durationSeconds: 120,
      storageUrl: "dev-blob://clips/modflag/tier-3.webm",
      customPromptText: "z",
    });

    await insertModerationFlag(db, { clipId: flaggedClip.id, flagType: "sexual", confidence: 0.7 });
    await insertModerationFlag(db, { clipId: flaggedClip.id, flagType: "violence", confidence: 0.6 });

    const flags = await getModerationFlagsForClip(db, flaggedClip.id);
    expect(flags.map((f) => f.flagType).sort()).toEqual(["sexual", "violence"]);

    expect(await getModerationFlagsForClip(db, cleanClip.id)).toEqual([]);
  });

  it("getModerationFlagsForChatMessage returns every flag recorded against that message, and none for a clean one", async () => {
    const flaggedMessage = await makeMessage("clerk_modflag_chatmulti_a1", "clerk_modflag_chatmulti_a2", "flagged");
    const cleanMessage = await makeMessage("clerk_modflag_chatclean_a1", "clerk_modflag_chatclean_a2", "clean");

    await insertModerationFlag(db, { chatMessageId: flaggedMessage.id, flagType: "sexual", confidence: 0.7 });
    await insertModerationFlag(db, { chatMessageId: flaggedMessage.id, flagType: "violence", confidence: 0.6 });

    const flags = await getModerationFlagsForChatMessage(db, flaggedMessage.id);
    expect(flags.map((f) => f.flagType).sort()).toEqual(["sexual", "violence"]);

    expect(await getModerationFlagsForChatMessage(db, cleanMessage.id)).toEqual([]);
  });

  it("getModerationFlagById returns the row by id, and undefined for an unknown id", async () => {
    const user = await ensureUserForClerkId(db, "clerk_modflag_byid");
    const clip = await insertClip(db, {
      userId: user.id,
      tier: 1,
      durationSeconds: 15,
      storageUrl: "dev-blob://clips/modflag/byid.wav",
      customPromptText: "x",
    });
    const flag = await insertModerationFlag(db, { clipId: clip.id, flagType: "violence", confidence: 0.55 });

    expect(await getModerationFlagById(db, flag.id)).toEqual(flag);
    expect(await getModerationFlagById(db, "00000000-0000-0000-0000-000000000000")).toBeUndefined();
  });

  it("markModerationFlagReviewed sets reviewed=true and the given action_taken, idempotently", async () => {
    const user = await ensureUserForClerkId(db, "clerk_modflag_review");
    const clip = await insertClip(db, {
      userId: user.id,
      tier: 1,
      durationSeconds: 15,
      storageUrl: "dev-blob://clips/modflag/review.wav",
      customPromptText: "x",
    });
    const flag = await insertModerationFlag(db, { clipId: clip.id, flagType: "harassment", confidence: 0.6 });

    const cleared = await markModerationFlagReviewed(db, flag.id, "cleared");
    expect(cleared.reviewed).toBe(true);
    expect(cleared.actionTaken).toBe("cleared");

    // Re-reviewing (e.g. a reviewer changing their mind) just re-applies
    // the new decision rather than erroring.
    const removed = await markModerationFlagReviewed(db, flag.id, "removed");
    expect(removed.reviewed).toBe(true);
    expect(removed.actionTaken).toBe("removed");

    await expect(
      markModerationFlagReviewed(db, "00000000-0000-0000-0000-000000000000", "cleared"),
    ).rejects.toThrow(/no moderation_flags row/);
  });

  it("getPendingClipModerationFlags lists only unreviewed clip flags, oldest first, joined to their clip", async () => {
    const user = await ensureUserForClerkId(db, "clerk_modflag_pending_clip");
    const clipA = await insertClip(db, {
      userId: user.id,
      tier: 1,
      durationSeconds: 15,
      storageUrl: "dev-blob://clips/modflag/pending-a.wav",
      customPromptText: "x",
    });
    const clipB = await insertClip(db, {
      userId: user.id,
      tier: 2,
      durationSeconds: 30,
      storageUrl: "dev-blob://clips/modflag/pending-b.webm",
      customPromptText: "y",
    });

    const flagA = await insertModerationFlag(db, { clipId: clipA.id, flagType: "sexual", confidence: 0.7 });
    const flagB = await insertModerationFlag(db, { clipId: clipB.id, flagType: "violence", confidence: 0.6 });
    const alreadyReviewed = await insertModerationFlag(db, {
      clipId: clipA.id,
      flagType: "harassment",
      confidence: 0.65,
    });
    await markModerationFlagReviewed(db, alreadyReviewed.id, "cleared");

    const pending = await getPendingClipModerationFlags(db);
    const pendingIds = pending.map((row) => row.flag.id);
    expect(pendingIds).toContain(flagA.id);
    expect(pendingIds).toContain(flagB.id);
    expect(pendingIds).not.toContain(alreadyReviewed.id);
    // Oldest-first: flagA was inserted before flagB.
    expect(pendingIds.indexOf(flagA.id)).toBeLessThan(pendingIds.indexOf(flagB.id));

    const rowA = pending.find((row) => row.flag.id === flagA.id);
    expect(rowA?.clip.id).toBe(clipA.id);
  });

  it("getPendingChatModerationFlags lists only unreviewed chat-message flags, oldest first, joined to their message", async () => {
    const messageA = await makeMessage("clerk_modflag_pending_chat_a1", "clerk_modflag_pending_chat_a2", "hey there");
    const messageB = await makeMessage("clerk_modflag_pending_chat_b1", "clerk_modflag_pending_chat_b2", "something else");

    const flagA = await insertModerationFlag(db, { chatMessageId: messageA.id, flagType: "sexual", confidence: 0.9 });
    const flagB = await insertModerationFlag(db, { chatMessageId: messageB.id, flagType: "harassment", confidence: 0.55 });
    const alreadyReviewed = await insertModerationFlag(db, {
      chatMessageId: messageA.id,
      flagType: "violence",
      confidence: 0.51,
    });
    await markModerationFlagReviewed(db, alreadyReviewed.id, "removed");

    const pending = await getPendingChatModerationFlags(db);
    const pendingIds = pending.map((row) => row.flag.id);
    expect(pendingIds).toContain(flagA.id);
    expect(pendingIds).toContain(flagB.id);
    expect(pendingIds).not.toContain(alreadyReviewed.id);
    expect(pendingIds.indexOf(flagA.id)).toBeLessThan(pendingIds.indexOf(flagB.id));

    const rowB = pending.find((row) => row.flag.id === flagB.id);
    expect(rowB?.chatMessage.id).toBe(messageB.id);
    expect(rowB?.chatMessage.body).toBe("something else");
  });
});
