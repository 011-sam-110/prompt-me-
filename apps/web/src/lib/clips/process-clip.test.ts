// ROADMAP.md M4 acceptance: "Successful upload enqueues transcription and
// moderation (mocked adapters acceptable for now) before moderation_status
// flips to approved" + "Tests cover: ... happy path [to approved]." Same
// PGlite-against-the-real-migration pattern as upload.test.ts.
import { dirname, resolve } from "node:path";
import { rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  DEV_MOCK_TRANSCRIPT_TEXT,
  PLACEHOLDER_FRAME_DATA_URL,
} from "@prompt-me/core";
import { ensureUserForClerkId, getModerationFlagsForClip } from "@prompt-me/db";
import * as schema from "@prompt-me/db/schema";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { uploadClip } from "./upload";
import { processClipUpload } from "./process-clip";

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

const ENV_KEYS = ["BLOB_READ_WRITE_TOKEN", "OPENAI_API_KEY", "FFMPEG_PATH"] as const;
const originalEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (originalEnv[k] === undefined) delete process.env[k];
    else process.env[k] = originalEnv[k];
  }
  vi.unstubAllGlobals();
});

describe("processClipUpload", () => {
  let client: PGlite;
  let db: PgliteDatabase<typeof schema>;

  beforeAll(async () => {
    client = new PGlite();
    db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder });
  });

  afterAll(async () => {
    await client.close();
    await rm(blobDataDir, { recursive: true, force: true });
  });

  describe("happy path via the mocked adapters (no OPENAI_API_KEY)", () => {
    it("an audio (tier 1) clip: transcribes, moderates the transcript only, and reaches approved", async () => {
      delete process.env.BLOB_READ_WRITE_TOKEN;
      delete process.env.OPENAI_API_KEY;
      const user = await ensureUserForClerkId(db, "clerk_process_tier1");
      const uploaded = await uploadClip(db, {
        userId: user.id,
        tier: 1,
        data: makeWavFixture(15),
        mimeType: "audio/wav",
        customPromptText: "What's a sound that instantly makes you happy?",
      });
      expect(uploaded.ok).toBe(true);
      if (!uploaded.ok) return;
      expect(uploaded.clip.moderationStatus).toBe("processing");

      const processed = await processClipUpload(db, uploaded.clip.id);

      expect(processed.transcript).toBe(DEV_MOCK_TRANSCRIPT_TEXT);
      expect(processed.moderationStatus).toBe("approved");
      expect(await getModerationFlagsForClip(db, uploaded.clip.id)).toEqual([]);
    });

    it("a video (tier 2) clip: also samples and moderates frames (1 per 10s), and reaches approved", async () => {
      delete process.env.BLOB_READ_WRITE_TOKEN;
      delete process.env.OPENAI_API_KEY;
      delete process.env.FFMPEG_PATH;
      const user = await ensureUserForClerkId(db, "clerk_process_tier2");
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
        data: makeWavFixture(30), // 30s -> 3 sampled frames at 0/10/20s
        mimeType: "video/webm",
        customPromptText: "y",
      });
      expect(t2.ok).toBe(true);
      if (!t2.ok) return;

      // Independent proof that the dev-mock frame sampler genuinely
      // produces one placeholder frame per computed timestamp (the actual
      // count — 3, for a 30s clip — is covered by timestamps.test.ts);
      // DevMockModerationProvider ignores frame content either way, so
      // this just confirms the shape processClipUpload relies on.
      const { getVideoFrameSampler } = await import("@prompt-me/core");
      const frames = await getVideoFrameSampler().sample({
        data: new Uint8Array([1]),
        mimeType: "video/webm",
        timestampsSeconds: [0, 10, 20],
      });
      expect(frames).toEqual([PLACEHOLDER_FRAME_DATA_URL, PLACEHOLDER_FRAME_DATA_URL, PLACEHOLDER_FRAME_DATA_URL]);

      const processed = await processClipUpload(db, t2.clip.id);
      expect(processed.moderationStatus).toBe("approved");
      expect(await getModerationFlagsForClip(db, t2.clip.id)).toEqual([]);
    });

    it("processClipUpload throws for an unknown clip id", async () => {
      await expect(processClipUpload(db, "00000000-0000-0000-0000-000000000000")).rejects.toThrow(
        /no clip found/,
      );
    });
  });

  describe("a flagged moderation result", () => {
    it("sets pending_review and records the flagged category, using the real adapter selection with stubbed fetch", async () => {
      delete process.env.BLOB_READ_WRITE_TOKEN;
      process.env.OPENAI_API_KEY = "sk-test-flagged";

      const fetchMock = vi.fn(async (input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/v1/audio/transcriptions")) {
          return new Response(JSON.stringify({ text: "a transcript with something bad in it" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (url.includes("/v1/moderations")) {
          return new Response(
            JSON.stringify({
              results: [
                {
                  flagged: true,
                  categories: { harassment: true, sexual: false },
                  category_scores: { harassment: 0.91, sexual: 0.01 },
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        throw new Error(`unexpected fetch in test: ${url}`);
      });
      vi.stubGlobal("fetch", fetchMock);

      const user = await ensureUserForClerkId(db, "clerk_process_flagged");
      const uploaded = await uploadClip(db, {
        userId: user.id,
        tier: 1,
        data: makeWavFixture(15),
        mimeType: "audio/wav",
        customPromptText: "x",
      });
      expect(uploaded.ok).toBe(true);
      if (!uploaded.ok) return;

      const processed = await processClipUpload(db, uploaded.clip.id);

      expect(processed.transcript).toBe("a transcript with something bad in it");
      expect(processed.moderationStatus).toBe("pending_review");

      const flags = await getModerationFlagsForClip(db, uploaded.clip.id);
      expect(flags).toHaveLength(1);
      expect(flags[0]!.flagType).toBe("harassment");
      expect(flags[0]!.confidence).toBeCloseTo(0.91, 5);
    });
  });
});
