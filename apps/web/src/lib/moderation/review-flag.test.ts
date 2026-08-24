// ROADMAP.md M12: "actions to approve or take down the flagged content."
// Same PGlite-against-the-real-migration pattern as
// lib/clips/process-clip.test.ts. Flags here are inserted directly
// (insertModerationFlag) against clips/messages already sitting in
// whatever state the automated pass (process-clip.ts /
// process-chat-message.ts) would have left them in — this file is only
// exercising the human-review half, not re-proving the automated scan
// those other test files already cover.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@prompt-me/db/schema";
import {
  acceptDateProposal,
  createChatMessage,
  createChatWindowIfNotExists,
  createDateProposal,
  ensurePromptsSeeded,
  ensureUserForClerkId,
  getChatMessageById,
  getClipById,
  insertClip,
  insertMatchIfNotExists,
  insertModerationFlag,
} from "@prompt-me/db";
import { approveModerationFlag, ModerationFlagNotFoundError, takeDownModerationFlag } from "./review-flag";

const migrationsFolder = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../packages/db/drizzle",
);
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const at = (isoTime: string) => new Date(`2026-09-10T${isoTime}:00.000Z`);

describe("review-flag", () => {
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

  async function makeFlaggedClip(clerkId: string) {
    const user = await ensureUserForClerkId(db, clerkId);
    const clip = await insertClip(db, {
      userId: user.id,
      tier: 1,
      durationSeconds: 15,
      storageUrl: `dev-blob://clips/review/${clerkId}.wav`,
      customPromptText: "x",
    });
    return clip;
  }

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

  it("rejects an unknown flag id for both actions", async () => {
    const badId = "00000000-0000-0000-0000-000000000000";
    await expect(approveModerationFlag(db, badId)).rejects.toBeInstanceOf(ModerationFlagNotFoundError);
    await expect(takeDownModerationFlag(db, badId)).rejects.toBeInstanceOf(ModerationFlagNotFoundError);
  });

  describe("clip flags", () => {
    it("approving a clip's only flag clears it and returns the clip to approved", async () => {
      const clip = await makeFlaggedClip("clerk_review_clip_solo");
      const flag = await insertModerationFlag(db, { clipId: clip.id, flagType: "sexual", confidence: 0.7 });

      const reviewed = await approveModerationFlag(db, flag.id);
      expect(reviewed.reviewed).toBe(true);
      expect(reviewed.actionTaken).toBe("cleared");

      const updatedClip = await getClipById(db, clip.id);
      expect(updatedClip?.moderationStatus).toBe("approved");
    });

    it("approving one of several flags leaves the clip pending_review until every flag is cleared", async () => {
      const clip = await makeFlaggedClip("clerk_review_clip_multi");
      const flagA = await insertModerationFlag(db, { clipId: clip.id, flagType: "sexual", confidence: 0.7 });
      const flagB = await insertModerationFlag(db, { clipId: clip.id, flagType: "violence", confidence: 0.6 });

      await approveModerationFlag(db, flagA.id);
      expect((await getClipById(db, clip.id))?.moderationStatus).toBe("pending_review");

      await approveModerationFlag(db, flagB.id);
      expect((await getClipById(db, clip.id))?.moderationStatus).toBe("approved");
    });

    it("taking down any one flag rejects the clip immediately, even with other flags still unreviewed", async () => {
      const clip = await makeFlaggedClip("clerk_review_clip_takedown");
      const flagA = await insertModerationFlag(db, { clipId: clip.id, flagType: "sexual", confidence: 0.9 });
      await insertModerationFlag(db, { clipId: clip.id, flagType: "violence", confidence: 0.55 });

      const reviewed = await takeDownModerationFlag(db, flagA.id);
      expect(reviewed.actionTaken).toBe("removed");
      expect((await getClipById(db, clip.id))?.moderationStatus).toBe("rejected");
    });

    it("a takedown stays sticky even if a sibling flag is separately cleared afterward", async () => {
      const clip = await makeFlaggedClip("clerk_review_clip_sticky");
      const flagA = await insertModerationFlag(db, { clipId: clip.id, flagType: "sexual", confidence: 0.9 });
      const flagB = await insertModerationFlag(db, { clipId: clip.id, flagType: "violence", confidence: 0.55 });

      await takeDownModerationFlag(db, flagA.id);
      await approveModerationFlag(db, flagB.id);

      expect((await getClipById(db, clip.id))?.moderationStatus).toBe("rejected");
    });

    it("re-reviewing the same flag is idempotent and re-derives the clip status from the current flag set", async () => {
      const clip = await makeFlaggedClip("clerk_review_clip_rereview");
      const flag = await insertModerationFlag(db, { clipId: clip.id, flagType: "sexual", confidence: 0.7 });

      await approveModerationFlag(db, flag.id);
      expect((await getClipById(db, clip.id))?.moderationStatus).toBe("approved");

      // A reviewer changes their mind on the same flag.
      await takeDownModerationFlag(db, flag.id);
      expect((await getClipById(db, clip.id))?.moderationStatus).toBe("rejected");
    });
  });

  describe("chat message flags", () => {
    it("taking down a chat flag soft-removes the message without touching its body", async () => {
      const message = await makeMessage("clerk_review_chat_takedown_a", "clerk_review_chat_takedown_b", "original text");
      const flag = await insertModerationFlag(db, { chatMessageId: message.id, flagType: "harassment", confidence: 0.6 });

      const reviewed = await takeDownModerationFlag(db, flag.id);
      expect(reviewed.actionTaken).toBe("removed");

      const updatedMessage = await getChatMessageById(db, message.id);
      expect(updatedMessage?.removedAt).not.toBeNull();
      expect(updatedMessage?.body).toBe("original text");
    });

    it("approving a chat flag clears it without removing the message", async () => {
      const message = await makeMessage("clerk_review_chat_approve_a", "clerk_review_chat_approve_b", "totally fine");
      const flag = await insertModerationFlag(db, { chatMessageId: message.id, flagType: "harassment", confidence: 0.55 });

      const reviewed = await approveModerationFlag(db, flag.id);
      expect(reviewed.actionTaken).toBe("cleared");

      const updatedMessage = await getChatMessageById(db, message.id);
      expect(updatedMessage?.removedAt).toBeNull();
    });
  });
});
