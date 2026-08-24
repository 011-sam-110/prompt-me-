// ROADMAP.md M5 acceptance: "Server (not client) marks clip_views.completed
// = true, driven by reported timeline position." Same PGlite-against-the-
// real-migration pattern as clips.test.ts.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "../schema";
import { ensureUserForClerkId } from "./users";
import { ensurePromptsSeeded } from "./prompts";
import { insertClip } from "./clips";
import { getClipView, getCompletedClipIdsForViewerAndProfile, recordClipViewPosition } from "./clip-views";

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../drizzle");

describe("clip-views queries", () => {
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

  it("getClipView returns undefined before any report has been made", async () => {
    const viewer = await ensureUserForClerkId(db, "clerk_clipviews_none_viewer");
    const owner = await ensureUserForClerkId(db, "clerk_clipviews_none_owner");
    const clip = await insertClip(db, {
      userId: owner.id,
      tier: 1,
      durationSeconds: 15,
      storageUrl: "dev-blob://x",
      customPromptText: "x",
    });

    expect(await getClipView(db, viewer.id, clip.id)).toBeUndefined();
  });

  it("creates a row on first report, not completed while short of the end", async () => {
    const viewer = await ensureUserForClerkId(db, "clerk_clipviews_first_viewer");
    const owner = await ensureUserForClerkId(db, "clerk_clipviews_first_owner");
    const clip = await insertClip(db, {
      userId: owner.id,
      tier: 1,
      durationSeconds: 15,
      storageUrl: "dev-blob://x",
      customPromptText: "x",
    });

    const row = await recordClipViewPosition(db, {
      viewerId: viewer.id,
      profileUserId: owner.id,
      clipId: clip.id,
      reachedEnd: false,
    });

    expect(row.completed).toBe(false);
    expect(row.completedAt).toBeNull();
    expect(row.viewerId).toBe(viewer.id);
    expect(row.profileUserId).toBe(owner.id);
    expect(row.clipId).toBe(clip.id);
  });

  it("flips completed true (with a completedAt) once a report reaches the end", async () => {
    const viewer = await ensureUserForClerkId(db, "clerk_clipviews_complete_viewer");
    const owner = await ensureUserForClerkId(db, "clerk_clipviews_complete_owner");
    const clip = await insertClip(db, {
      userId: owner.id,
      tier: 1,
      durationSeconds: 15,
      storageUrl: "dev-blob://x",
      customPromptText: "x",
    });

    await recordClipViewPosition(db, {
      viewerId: viewer.id,
      profileUserId: owner.id,
      clipId: clip.id,
      reachedEnd: false,
    });
    const completedRow = await recordClipViewPosition(db, {
      viewerId: viewer.id,
      profileUserId: owner.id,
      clipId: clip.id,
      reachedEnd: true,
    });

    expect(completedRow.completed).toBe(true);
    expect(completedRow.completedAt).not.toBeNull();
  });

  it("never un-completes: a later low-position report leaves an already-completed row completed", async () => {
    const viewer = await ensureUserForClerkId(db, "clerk_clipviews_monotonic_viewer");
    const owner = await ensureUserForClerkId(db, "clerk_clipviews_monotonic_owner");
    const clip = await insertClip(db, {
      userId: owner.id,
      tier: 1,
      durationSeconds: 15,
      storageUrl: "dev-blob://x",
      customPromptText: "x",
    });

    await recordClipViewPosition(db, {
      viewerId: viewer.id,
      profileUserId: owner.id,
      clipId: clip.id,
      reachedEnd: true,
    });
    const completedAt = (await getClipView(db, viewer.id, clip.id))!.completedAt;

    // A rewind-and-replay produces further reports whose position hasn't
    // reached the end yet (reachedEnd: false) — this must never revert a
    // standing completion (ENGINEERING_SPEC §7).
    const afterRewind = await recordClipViewPosition(db, {
      viewerId: viewer.id,
      profileUserId: owner.id,
      clipId: clip.id,
      reachedEnd: false,
    });

    expect(afterRewind.completed).toBe(true);
    expect(afterRewind.completedAt?.getTime()).toBe(completedAt?.getTime());
  });

  it("keeps separate rows per (viewer, clip) — one viewer's report never affects another's", async () => {
    const viewerA = await ensureUserForClerkId(db, "clerk_clipviews_multi_viewer_a");
    const viewerB = await ensureUserForClerkId(db, "clerk_clipviews_multi_viewer_b");
    const owner = await ensureUserForClerkId(db, "clerk_clipviews_multi_owner");
    const clip = await insertClip(db, {
      userId: owner.id,
      tier: 1,
      durationSeconds: 15,
      storageUrl: "dev-blob://x",
      customPromptText: "x",
    });

    await recordClipViewPosition(db, {
      viewerId: viewerA.id,
      profileUserId: owner.id,
      clipId: clip.id,
      reachedEnd: true,
    });

    expect((await getClipView(db, viewerA.id, clip.id))?.completed).toBe(true);
    expect(await getClipView(db, viewerB.id, clip.id)).toBeUndefined();
  });

  describe("getCompletedClipIdsForViewerAndProfile", () => {
    it("is empty with no reports at all — ENGINEERING_SPEC §7's viewer-side input", async () => {
      const viewer = await ensureUserForClerkId(db, "clerk_completed_ids_empty_viewer");
      const owner = await ensureUserForClerkId(db, "clerk_completed_ids_empty_owner");
      expect(await getCompletedClipIdsForViewerAndProfile(db, viewer.id, owner.id)).toEqual(new Set());
    });

    it("excludes clips reported but not yet completed", async () => {
      const viewer = await ensureUserForClerkId(db, "clerk_completed_ids_partial_viewer");
      const owner = await ensureUserForClerkId(db, "clerk_completed_ids_partial_owner");
      const clip = await insertClip(db, {
        userId: owner.id,
        tier: 1,
        durationSeconds: 15,
        storageUrl: "dev-blob://x",
        customPromptText: "x",
      });
      await recordClipViewPosition(db, {
        viewerId: viewer.id,
        profileUserId: owner.id,
        clipId: clip.id,
        reachedEnd: false,
      });

      expect(await getCompletedClipIdsForViewerAndProfile(db, viewer.id, owner.id)).toEqual(new Set());
    });

    it("returns exactly the completed clip ids for that (viewer, profile) pair", async () => {
      const viewer = await ensureUserForClerkId(db, "clerk_completed_ids_full_viewer");
      const owner = await ensureUserForClerkId(db, "clerk_completed_ids_full_owner");
      const tier1 = await insertClip(db, {
        userId: owner.id,
        tier: 1,
        durationSeconds: 15,
        storageUrl: "dev-blob://a",
        customPromptText: "x",
      });
      const tier2 = await insertClip(db, {
        userId: owner.id,
        tier: 2,
        durationSeconds: 30,
        storageUrl: "dev-blob://b",
        customPromptText: "y",
      });
      await recordClipViewPosition(db, {
        viewerId: viewer.id,
        profileUserId: owner.id,
        clipId: tier1.id,
        reachedEnd: true,
      });
      await recordClipViewPosition(db, {
        viewerId: viewer.id,
        profileUserId: owner.id,
        clipId: tier2.id,
        reachedEnd: false,
      });

      expect(await getCompletedClipIdsForViewerAndProfile(db, viewer.id, owner.id)).toEqual(
        new Set([tier1.id]),
      );
    });

    it("never mixes another viewer's or another profile's completions in", async () => {
      const viewerA = await ensureUserForClerkId(db, "clerk_completed_ids_cross_viewer_a");
      const viewerB = await ensureUserForClerkId(db, "clerk_completed_ids_cross_viewer_b");
      const owner = await ensureUserForClerkId(db, "clerk_completed_ids_cross_owner");
      const otherOwner = await ensureUserForClerkId(db, "clerk_completed_ids_cross_other_owner");
      const clip = await insertClip(db, {
        userId: owner.id,
        tier: 1,
        durationSeconds: 15,
        storageUrl: "dev-blob://a",
        customPromptText: "x",
      });
      const otherClip = await insertClip(db, {
        userId: otherOwner.id,
        tier: 1,
        durationSeconds: 15,
        storageUrl: "dev-blob://b",
        customPromptText: "y",
      });
      await recordClipViewPosition(db, {
        viewerId: viewerA.id,
        profileUserId: owner.id,
        clipId: clip.id,
        reachedEnd: true,
      });
      await recordClipViewPosition(db, {
        viewerId: viewerA.id,
        profileUserId: otherOwner.id,
        clipId: otherClip.id,
        reachedEnd: true,
      });

      expect(await getCompletedClipIdsForViewerAndProfile(db, viewerA.id, owner.id)).toEqual(
        new Set([clip.id]),
      );
      expect(await getCompletedClipIdsForViewerAndProfile(db, viewerB.id, owner.id)).toEqual(new Set());
    });
  });
});
