// ROADMAP.md M4 acceptance: "Tests cover: sequential-dependency rejection,
// duration rejection, happy path [to a persisted clip]." Same
// PGlite-against-the-real-migration pattern as
// lib/verification/run-check.test.ts.
import { dirname, resolve } from "node:path";
import { rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  ensurePromptsSeeded,
  ensureUserForClerkId,
  getActivePromptsForTier,
  getClipTiersForUser,
} from "@prompt-me/db";
import * as schema from "@prompt-me/db/schema";
import { readMockClipBytes } from "@prompt-me/core";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { uploadClip } from "./upload";

const migrationsFolder = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../packages/db/drizzle",
);
const blobDataDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../packages/core/.dev-blob-data",
);

function makeWavFixture(durationSeconds: number, sampleRate = 8000): Uint8Array {
  const numSamples = Math.round(durationSeconds * sampleRate);
  const dataSize = numSamples * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  return new Uint8Array(buf);
}

const originalBlobToken = process.env.BLOB_READ_WRITE_TOKEN;
afterEach(() => {
  if (originalBlobToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
  else process.env.BLOB_READ_WRITE_TOKEN = originalBlobToken;
});

describe("uploadClip", () => {
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
    await rm(blobDataDir, { recursive: true, force: true });
  });

  it("rejects an invalid tier outright", async () => {
    const user = await ensureUserForClerkId(db, "clerk_upload_bad_tier");
    const result = await uploadClip(db, {
      userId: user.id,
      tier: 7,
      data: makeWavFixture(15),
      mimeType: "audio/wav",
      customPromptText: "x",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("invalid_tier");
  });

  describe("sequential tier dependency", () => {
    it("allows tier 1 with zero prior clips", async () => {
      const user = await ensureUserForClerkId(db, "clerk_upload_tier1_first");
      const result = await uploadClip(db, {
        userId: user.id,
        tier: 1,
        data: makeWavFixture(15),
        mimeType: "audio/wav",
        customPromptText: "What's a sound that instantly makes you happy?",
      });
      expect(result.ok).toBe(true);
    });

    it("rejects tier 2 when tier 1 doesn't exist yet for this user", async () => {
      const user = await ensureUserForClerkId(db, "clerk_upload_skip_tier1");
      const result = await uploadClip(db, {
        userId: user.id,
        tier: 2,
        data: makeWavFixture(30),
        mimeType: "video/webm",
        customPromptText: "x",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("tier_dependency");
        expect(result.error.message).toMatch(/tier 2/);
        expect(result.error.message).toMatch(/tier 1/);
      }
    });

    it("rejects tier 4 when only tier 1-2 exist (skipping tier 3)", async () => {
      const user = await ensureUserForClerkId(db, "clerk_upload_skip_tier3");
      const t1 = await uploadClip(db, {
        userId: user.id,
        tier: 1,
        data: makeWavFixture(15),
        mimeType: "audio/wav",
        customPromptText: "x",
      });
      expect(t1.ok).toBe(true);
      const t2 = await uploadClip(db, {
        userId: user.id,
        tier: 2,
        data: makeWavFixture(30),
        mimeType: "video/webm",
        customPromptText: "y",
      });
      expect(t2.ok).toBe(true);

      const t4 = await uploadClip(db, {
        userId: user.id,
        tier: 4,
        data: makeWavFixture(180),
        mimeType: "video/webm",
        customPromptText: "z",
      });
      expect(t4.ok).toBe(false);
      if (!t4.ok) expect(t4.error.code).toBe("tier_dependency");
    });

    it("allows the full 1->2->3->4 chain in order", async () => {
      const user = await ensureUserForClerkId(db, "clerk_upload_full_chain");
      const durations = { 1: 15, 2: 30, 3: 120, 4: 180 } as const;
      for (const tier of [1, 2, 3, 4] as const) {
        const result = await uploadClip(db, {
          userId: user.id,
          tier,
          data: makeWavFixture(durations[tier]),
          mimeType: tier === 1 ? "audio/wav" : "video/webm",
          customPromptText: `prompt for tier ${tier}`,
        });
        expect(result.ok, `tier ${tier} should succeed`).toBe(true);
      }
    });
  });

  describe("server-side duration validation", () => {
    it("rejects a clip measured well outside the tier's tolerance (too short)", async () => {
      const user = await ensureUserForClerkId(db, "clerk_upload_too_short");
      const result = await uploadClip(db, {
        userId: user.id,
        tier: 1,
        data: makeWavFixture(5), // tier 1 wants ~15s
        mimeType: "audio/wav",
        customPromptText: "x",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("duration_out_of_range");
        if (result.error.code === "duration_out_of_range") {
          expect(result.error.measuredDurationSeconds).toBeCloseTo(5, 1);
        }
      }
    });

    it("rejects a clip measured well outside the tier's tolerance (too long)", async () => {
      const user = await ensureUserForClerkId(db, "clerk_upload_too_long");
      const result = await uploadClip(db, {
        userId: user.id,
        tier: 1,
        data: makeWavFixture(25),
        mimeType: "audio/wav",
        customPromptText: "x",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("duration_out_of_range");
    });

    it("rejects just past the ±0.5s tolerance boundary", async () => {
      const user = await ensureUserForClerkId(db, "clerk_upload_boundary_reject");
      const result = await uploadClip(db, {
        userId: user.id,
        tier: 1,
        data: makeWavFixture(15.51),
        mimeType: "audio/wav",
        customPromptText: "x",
      });
      expect(result.ok).toBe(false);
    });

    it("accepts right at the ±0.5s tolerance boundary", async () => {
      const user = await ensureUserForClerkId(db, "clerk_upload_boundary_accept");
      const result = await uploadClip(db, {
        userId: user.id,
        tier: 1,
        data: makeWavFixture(15.49),
        mimeType: "audio/wav",
        customPromptText: "x",
      });
      expect(result.ok).toBe(true);
    });

    it("validates each tier against its own target (30s clip rejected for tier 3's 120s slot)", async () => {
      const user = await ensureUserForClerkId(db, "clerk_upload_tier3_wrong_length");
      await uploadClip(db, {
        userId: user.id,
        tier: 1,
        data: makeWavFixture(15),
        mimeType: "audio/wav",
        customPromptText: "x",
      });
      await uploadClip(db, {
        userId: user.id,
        tier: 2,
        data: makeWavFixture(30),
        mimeType: "video/webm",
        customPromptText: "y",
      });
      const result = await uploadClip(db, {
        userId: user.id,
        tier: 3,
        data: makeWavFixture(30), // wrong for tier 3 (wants 120s)
        mimeType: "video/webm",
        customPromptText: "z",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("duration_out_of_range");
    });
  });

  describe("prompt selection", () => {
    it("rejects neither promptId nor customPromptText", async () => {
      const user = await ensureUserForClerkId(db, "clerk_upload_no_prompt");
      const result = await uploadClip(db, {
        userId: user.id,
        tier: 1,
        data: makeWavFixture(15),
        mimeType: "audio/wav",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("invalid_prompt_selection");
    });

    it("rejects both promptId and customPromptText", async () => {
      const user = await ensureUserForClerkId(db, "clerk_upload_both_prompt");
      const [prompt] = await getActivePromptsForTier(db, 1);
      const result = await uploadClip(db, {
        userId: user.id,
        tier: 1,
        data: makeWavFixture(15),
        mimeType: "audio/wav",
        promptId: prompt!.id,
        customPromptText: "also this",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("invalid_prompt_selection");
    });

    it("rejects a promptId belonging to a different tier", async () => {
      const user = await ensureUserForClerkId(db, "clerk_upload_wrong_tier_prompt");
      const [tier2Prompt] = await getActivePromptsForTier(db, 2);
      const result = await uploadClip(db, {
        userId: user.id,
        tier: 1,
        data: makeWavFixture(15),
        mimeType: "audio/wav",
        promptId: tier2Prompt!.id,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("invalid_prompt_selection");
    });

    it("rejects an unknown promptId", async () => {
      const user = await ensureUserForClerkId(db, "clerk_upload_unknown_prompt");
      const result = await uploadClip(db, {
        userId: user.id,
        tier: 1,
        data: makeWavFixture(15),
        mimeType: "audio/wav",
        promptId: "00000000-0000-0000-0000-000000000000",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("invalid_prompt_selection");
    });

    it("accepts a valid curated promptId for the matching tier", async () => {
      const user = await ensureUserForClerkId(db, "clerk_upload_curated_prompt");
      const [prompt] = await getActivePromptsForTier(db, 1);
      const result = await uploadClip(db, {
        userId: user.id,
        tier: 1,
        data: makeWavFixture(15),
        mimeType: "audio/wav",
        promptId: prompt!.id,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.clip.promptId).toBe(prompt!.id);
        expect(result.clip.customPromptText).toBeNull();
      }
    });
  });

  describe("happy path", () => {
    it("persists the clip via the storage adapter (mock, no BLOB token in tests) and inserts a row", async () => {
      delete process.env.BLOB_READ_WRITE_TOKEN;
      const user = await ensureUserForClerkId(db, "clerk_upload_happy_path");
      const bytes = makeWavFixture(15);

      const result = await uploadClip(db, {
        userId: user.id,
        tier: 1,
        data: bytes,
        mimeType: "audio/wav",
        customPromptText: "What's a sound that instantly makes you happy?",
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.clip.userId).toBe(user.id);
      expect(result.clip.tier).toBe(1);
      expect(result.clip.durationSeconds).toBeCloseTo(15, 1);
      expect(result.clip.moderationStatus).toBe("processing");
      expect(result.clip.storageUrl.startsWith("dev-blob://")).toBe(true);

      // Proves the storage step is genuine, not a no-op that only wrote a
      // DB row: the exact uploaded bytes are really retrievable back out
      // of the (mock) storage adapter.
      const key = result.clip.storageUrl.replace("dev-blob://", "");
      const storedBytes = await readMockClipBytes(key);
      expect(Array.from(storedBytes)).toEqual(Array.from(bytes));
    });

    it("rejects a second upload attempt at a tier that's already taken (DB unique constraint), leaving the first clip intact", async () => {
      const user = await ensureUserForClerkId(db, "clerk_upload_duplicate_tier");
      const first = await uploadClip(db, {
        userId: user.id,
        tier: 1,
        data: makeWavFixture(15),
        mimeType: "audio/wav",
        customPromptText: "first",
      });
      expect(first.ok).toBe(true);

      await expect(
        uploadClip(db, {
          userId: user.id,
          tier: 1,
          data: makeWavFixture(15),
          mimeType: "audio/wav",
          customPromptText: "second",
        }),
      ).rejects.toBeTruthy();

      expect(await getClipTiersForUser(db, user.id)).toEqual([1]);
    });
  });
});
