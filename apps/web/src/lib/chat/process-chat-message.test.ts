// ENGINEERING_SPEC.md §12 / ROADMAP.md M12: "Chat messages get the same
// text-moderation pass, async ... rather than blocking send." Same
// PGlite-against-the-real-migration + stubbed-fetch pattern as
// lib/clips/process-clip.test.ts's own "flagged moderation result" case —
// this file proves the moderation half in isolation (awaited directly,
// not raced through the fire-and-forget enqueueChatMessageModeration);
// send-message.test.ts covers that sending itself is never blocked by it.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@prompt-me/db/schema";
import {
  acceptDateProposal,
  createChatMessage,
  createChatWindowIfNotExists,
  createDateProposal,
  ensurePromptsSeeded,
  ensureUserForClerkId,
  getModerationFlagsForChatMessage,
  insertMatchIfNotExists,
} from "@prompt-me/db";
import { processChatMessageModeration } from "./process-chat-message";

const migrationsFolder = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../packages/db/drizzle",
);
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const at = (isoTime: string) => new Date(`2026-09-10T${isoTime}:00.000Z`);

const ENV_KEYS = ["OPENAI_API_KEY"] as const;
const originalEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (originalEnv[k] === undefined) delete process.env[k];
    else process.env[k] = originalEnv[k];
  }
  vi.unstubAllGlobals();
});

describe("processChatMessageModeration", () => {
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

  it("a clean message via the dev-mock provider (no OPENAI_API_KEY) records no flags", async () => {
    delete process.env.OPENAI_API_KEY;
    const message = await makeMessage("clerk_chatmod_clean_a", "clerk_chatmod_clean_b", "see you there!");

    await processChatMessageModeration(db, message.id, message.body);

    expect(await getModerationFlagsForChatMessage(db, message.id)).toEqual([]);
  });

  it("a flagged message records one moderation_flags row against the chat message, using the real adapter selection with stubbed fetch", async () => {
    process.env.OPENAI_API_KEY = "sk-test-chat-flagged";

    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/v1/moderations")) {
        return new Response(
          JSON.stringify({
            results: [
              {
                flagged: true,
                categories: { harassment: true, sexual: false },
                category_scores: { harassment: 0.77, sexual: 0.02 },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      throw new Error(`unexpected fetch in test: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const message = await makeMessage(
      "clerk_chatmod_flagged_a",
      "clerk_chatmod_flagged_b",
      "a message with something bad in it",
    );

    await processChatMessageModeration(db, message.id, message.body);

    const flags = await getModerationFlagsForChatMessage(db, message.id);
    expect(flags).toHaveLength(1);
    expect(flags[0]!.flagType).toBe("harassment");
    expect(flags[0]!.confidence).toBeCloseTo(0.77, 5);
    expect(flags[0]!.reviewed).toBe(false);
    expect(flags[0]!.clipId).toBeNull();
  });
});
