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
import { getClipForUserAndTier, getClipTiersForUser, insertClip } from "./clips";

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
});
