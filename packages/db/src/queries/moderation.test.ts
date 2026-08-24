// ROADMAP.md M4/M12: moderation_flags data access. Same
// PGlite-against-the-real-migration pattern as clips.test.ts.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "../schema";
import { insertClip } from "./clips";
import { getModerationFlagsForClip, insertModerationFlag } from "./moderation";
import { ensureUserForClerkId } from "./users";

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../drizzle");

describe("moderation_flags queries", () => {
  let client: PGlite;
  let db: PgliteDatabase<typeof schema>;

  beforeAll(async () => {
    client = new PGlite();
    db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder });
  });

  afterAll(async () => {
    await client.close();
  });

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
});
