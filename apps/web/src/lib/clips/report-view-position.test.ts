// ROADMAP.md M5 acceptance: "Server (not client) marks clip_views.completed
// = true, driven by reported timeline position." Same PGlite-against-the-
// real-migration pattern as lib/clips/upload.test.ts.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ensurePromptsSeeded, ensureUserForClerkId, insertClip } from "@prompt-me/db";
import * as schema from "@prompt-me/db/schema";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { reportClipViewPosition } from "./report-view-position";

const migrationsFolder = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../packages/db/drizzle",
);

describe("reportClipViewPosition", () => {
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

  it("rejects an unknown clip id", async () => {
    const viewer = await ensureUserForClerkId(db, "clerk_report_unknown_clip");
    const result = await reportClipViewPosition(db, {
      viewerId: viewer.id,
      clipId: "00000000-0000-0000-0000-000000000000",
      positionSeconds: 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("clip_not_found");
  });

  it("rejects a negative or non-finite position without touching the DB", async () => {
    const viewer = await ensureUserForClerkId(db, "clerk_report_bad_position_viewer");
    const owner = await ensureUserForClerkId(db, "clerk_report_bad_position_owner");
    const clip = await insertClip(db, {
      userId: owner.id,
      tier: 1,
      durationSeconds: 15,
      storageUrl: "dev-blob://x",
      customPromptText: "x",
    });

    for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = await reportClipViewPosition(db, {
        viewerId: viewer.id,
        clipId: clip.id,
        positionSeconds: bad,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("invalid_position");
    }
  });

  it("does not mark completed for a position well short of the clip's duration", async () => {
    const viewer = await ensureUserForClerkId(db, "clerk_report_short_viewer");
    const owner = await ensureUserForClerkId(db, "clerk_report_short_owner");
    const clip = await insertClip(db, {
      userId: owner.id,
      tier: 1,
      durationSeconds: 15,
      storageUrl: "dev-blob://x",
      customPromptText: "x",
    });

    const result = await reportClipViewPosition(db, {
      viewerId: viewer.id,
      clipId: clip.id,
      positionSeconds: 3,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.clipView.completed).toBe(false);
  });

  it("marks completed once the reported position reaches the clip's duration", async () => {
    const viewer = await ensureUserForClerkId(db, "clerk_report_complete_viewer");
    const owner = await ensureUserForClerkId(db, "clerk_report_complete_owner");
    const clip = await insertClip(db, {
      userId: owner.id,
      tier: 1,
      durationSeconds: 15,
      storageUrl: "dev-blob://x",
      customPromptText: "x",
    });

    const result = await reportClipViewPosition(db, {
      viewerId: viewer.id,
      clipId: clip.id,
      positionSeconds: 15,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.clipView.completed).toBe(true);
      expect(result.clipView.profileUserId).toBe(owner.id);
    }
  });

  it("a wildly over-reported position doesn't grant anything beyond ordinary completion", async () => {
    const viewer = await ensureUserForClerkId(db, "clerk_report_overshoot_viewer");
    const owner = await ensureUserForClerkId(db, "clerk_report_overshoot_owner");
    const clip = await insertClip(db, {
      userId: owner.id,
      tier: 1,
      durationSeconds: 15,
      storageUrl: "dev-blob://x",
      customPromptText: "x",
    });

    const result = await reportClipViewPosition(db, {
      viewerId: viewer.id,
      clipId: clip.id,
      positionSeconds: 999_999,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.clipView.completed).toBe(true);
  });

  it("never un-completes across repeated reports (rewind-and-replay behavior)", async () => {
    const viewer = await ensureUserForClerkId(db, "clerk_report_monotonic_viewer");
    const owner = await ensureUserForClerkId(db, "clerk_report_monotonic_owner");
    const clip = await insertClip(db, {
      userId: owner.id,
      tier: 1,
      durationSeconds: 15,
      storageUrl: "dev-blob://x",
      customPromptText: "x",
    });

    await reportClipViewPosition(db, { viewerId: viewer.id, clipId: clip.id, positionSeconds: 15 });
    const afterRewind = await reportClipViewPosition(db, {
      viewerId: viewer.id,
      clipId: clip.id,
      positionSeconds: 0.5,
    });
    expect(afterRewind.ok).toBe(true);
    if (afterRewind.ok) expect(afterRewind.clipView.completed).toBe(true);
  });
});
