// ROADMAP.md M4: clip upload data access. Same PGlite-against-the-real-
// migration pattern as prompts.test.ts / users.test.ts.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "../schema";
import { ensureUserForClerkId } from "./users";
import { ensurePromptsSeeded, getActivePromptsForTier } from "./prompts";
import {
  getClipById,
  getClipForUserAndTier,
  getClipsForUserInUploadOrder,
  getClipTiersForUser,
  insertClip,
  updateClipModerationStatus,
  updateClipTranscript,
} from "./clips";

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../drizzle");

describe("clips queries", () => {
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

  it("getClipTiersForUser is empty for a brand-new user", async () => {
    const user = await ensureUserForClerkId(db, "clerk_clips_empty");
    expect(await getClipTiersForUser(db, user.id)).toEqual([]);
  });

  it("insertClip writes a row with a custom prompt and moderation_status defaulting to processing", async () => {
    const user = await ensureUserForClerkId(db, "clerk_clips_custom");

    const clip = await insertClip(db, {
      userId: user.id,
      tier: 1,
      durationSeconds: 15.1,
      storageUrl: "dev-blob://clips/x/tier-1-a.webm",
      customPromptText: "What's a sound that instantly makes you happy?",
    });

    expect(clip.tier).toBe(1);
    expect(clip.customPromptText).toBe("What's a sound that instantly makes you happy?");
    expect(clip.promptId).toBeNull();
    expect(clip.moderationStatus).toBe("processing");

    expect(await getClipTiersForUser(db, user.id)).toEqual([1]);
    const found = await getClipForUserAndTier(db, user.id, 1);
    expect(found?.id).toBe(clip.id);
  });

  it("insertClip writes a row referencing a curated prompt", async () => {
    const user = await ensureUserForClerkId(db, "clerk_clips_curated");
    const [prompt] = await getActivePromptsForTier(db, 2);

    const clip = await insertClip(db, {
      userId: user.id,
      tier: 2,
      durationSeconds: 29.7,
      storageUrl: "dev-blob://clips/y/tier-2-a.webm",
      promptId: prompt!.id,
    });

    expect(clip.promptId).toBe(prompt!.id);
    expect(clip.customPromptText).toBeNull();
  });

  it("accumulates tiers across multiple uploads for the same user, in any order", async () => {
    const user = await ensureUserForClerkId(db, "clerk_clips_multi");
    await insertClip(db, {
      userId: user.id,
      tier: 1,
      durationSeconds: 15,
      storageUrl: "dev-blob://a",
      customPromptText: "x",
    });
    await insertClip(db, {
      userId: user.id,
      tier: 2,
      durationSeconds: 30,
      storageUrl: "dev-blob://b",
      customPromptText: "y",
    });

    expect((await getClipTiersForUser(db, user.id)).sort()).toEqual([1, 2]);
  });

  it("getClipForUserAndTier returns undefined when that tier doesn't exist yet", async () => {
    const user = await ensureUserForClerkId(db, "clerk_clips_missing_tier");
    expect(await getClipForUserAndTier(db, user.id, 3)).toBeUndefined();
  });

  describe("getClipById / updateClipTranscript / updateClipModerationStatus", () => {
    it("getClipById finds a clip by its own id and returns undefined for an unknown one", async () => {
      const user = await ensureUserForClerkId(db, "clerk_clips_by_id");
      const clip = await insertClip(db, {
        userId: user.id,
        tier: 1,
        durationSeconds: 15,
        storageUrl: "dev-blob://clips/by-id/tier-1.wav",
        customPromptText: "x",
      });

      expect((await getClipById(db, clip.id))?.id).toBe(clip.id);
      expect(await getClipById(db, "00000000-0000-0000-0000-000000000000")).toBeUndefined();
    });

    it("updateClipTranscript writes the transcript without touching moderation_status", async () => {
      const user = await ensureUserForClerkId(db, "clerk_clips_transcript");
      const clip = await insertClip(db, {
        userId: user.id,
        tier: 1,
        durationSeconds: 15,
        storageUrl: "dev-blob://clips/transcript/tier-1.wav",
        customPromptText: "x",
      });
      expect(clip.transcript).toBeNull();

      const updated = await updateClipTranscript(db, clip.id, "hello, this is the transcript");
      expect(updated.transcript).toBe("hello, this is the transcript");
      expect(updated.moderationStatus).toBe("processing");
    });

    it("updateClipModerationStatus flips the status without touching the transcript", async () => {
      const user = await ensureUserForClerkId(db, "clerk_clips_mod_status");
      const clip = await insertClip(db, {
        userId: user.id,
        tier: 1,
        durationSeconds: 15,
        storageUrl: "dev-blob://clips/mod-status/tier-1.wav",
        customPromptText: "x",
      });
      await updateClipTranscript(db, clip.id, "a transcript");

      const approved = await updateClipModerationStatus(db, clip.id, "approved");
      expect(approved.moderationStatus).toBe("approved");
      expect(approved.transcript).toBe("a transcript");

      const flagged = await updateClipModerationStatus(db, clip.id, "pending_review");
      expect(flagged.moderationStatus).toBe("pending_review");
    });

    it("updateClipTranscript throws for an unknown clip id", async () => {
      await expect(
        updateClipTranscript(db, "00000000-0000-0000-0000-000000000000", "x"),
      ).rejects.toThrow(/no clip found/);
    });
  });

  describe("getClipsForUserInUploadOrder", () => {
    it("is empty for a user with no clips", async () => {
      const user = await ensureUserForClerkId(db, "clerk_clips_nav_empty");
      expect(await getClipsForUserInUploadOrder(db, user.id)).toEqual([]);
    });

    it("orders by tier ascending regardless of insert order — SPEC.md §3's 'upload order'", async () => {
      const user = await ensureUserForClerkId(db, "clerk_clips_nav_order");
      const tier2 = await insertClip(db, {
        userId: user.id,
        tier: 2,
        durationSeconds: 30,
        storageUrl: "dev-blob://nav/tier-2.webm",
        customPromptText: "tier 2",
      });
      const tier1 = await insertClip(db, {
        userId: user.id,
        tier: 1,
        durationSeconds: 15,
        storageUrl: "dev-blob://nav/tier-1.wav",
        customPromptText: "tier 1",
      });

      const stack = await getClipsForUserInUploadOrder(db, user.id);
      expect(stack.map((clip) => clip.id)).toEqual([tier1.id, tier2.id]);
      expect(stack.map((clip) => clip.tier)).toEqual([1, 2]);
    });

    it("never returns another user's clips", async () => {
      const userA = await ensureUserForClerkId(db, "clerk_clips_nav_a");
      const userB = await ensureUserForClerkId(db, "clerk_clips_nav_b");
      await insertClip(db, {
        userId: userA.id,
        tier: 1,
        durationSeconds: 15,
        storageUrl: "dev-blob://nav/a-tier-1.wav",
        customPromptText: "a",
      });

      expect(await getClipsForUserInUploadOrder(db, userB.id)).toEqual([]);
    });
  });
});
