// ROADMAP.md M11 / ENGINEERING_SPEC.md §11. Same PGlite-against-the-real-
// migration pattern as rewatch-sessions.test.ts. Purely mechanical
// coverage — the actual opens_at/closes_at derivation is
// @prompt-me/core's computeChatWindowTimes (packages/core/src/chat-windows/window.test.ts);
// this file only proves the query functions read/write the right rows,
// including the idempotency createChatWindowIfNotExists is responsible for.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "../schema";
import { ensureUserForClerkId } from "./users";
import { ensurePromptsSeeded } from "./prompts";
import { insertMatchIfNotExists } from "./matches";
import { acceptDateProposal, createDateProposal } from "./date-proposals";
import { createChatWindowIfNotExists, getChatWindowById, getChatWindowByProposalId } from "./chat-windows";

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../drizzle");
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

const at = (isoTime: string) => new Date(`2026-09-10T${isoTime}:00.000Z`);

describe("chat_windows queries", () => {
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

  async function makeAcceptedProposal(clerkIdA: string, clerkIdB: string) {
    const a = await ensureUserForClerkId(db, clerkIdA);
    const b = await ensureUserForClerkId(db, clerkIdB);
    const match = await insertMatchIfNotExists(db, { userAId: a.id, userBId: b.id });
    const proposal = await createDateProposal(db, {
      matchId: match.id,
      proposedByUserId: a.id,
      ideaText: "Coffee at the corner café",
      slotStartAt: at("18:00"),
      slotEndAt: at("19:00"),
    });
    await acceptDateProposal(db, proposal.id);
    return { match, proposal, a: a.id, b: b.id };
  }

  it("getChatWindowByProposalId returns undefined before any window has been created", async () => {
    const { proposal } = await makeAcceptedProposal("clerk_cw_none_a", "clerk_cw_none_b");
    expect(await getChatWindowByProposalId(db, proposal.id)).toBeUndefined();
  });

  it("createChatWindowIfNotExists persists a row readable by both getters", async () => {
    const { match, proposal } = await makeAcceptedProposal("clerk_cw_create_a", "clerk_cw_create_b");
    const opensAt = new Date(proposal.slotStartAt.getTime() - 60 * MINUTE_MS);
    const closesAt = new Date(proposal.slotStartAt.getTime() + 4 * HOUR_MS);

    const created = await createChatWindowIfNotExists(db, {
      matchId: match.id,
      dateProposalId: proposal.id,
      opensAt,
      closesAt,
    });

    expect(created.matchId).toBe(match.id);
    expect(created.dateProposalId).toBe(proposal.id);
    expect(created.opensAt.getTime()).toBe(opensAt.getTime());
    expect(created.closesAt.getTime()).toBe(closesAt.getTime());

    expect((await getChatWindowById(db, created.id))?.id).toBe(created.id);
    expect((await getChatWindowByProposalId(db, proposal.id))?.id).toBe(created.id);
  });

  it("getChatWindowById returns undefined for a nonexistent id", async () => {
    expect(await getChatWindowById(db, "00000000-0000-0000-0000-000000000000")).toBeUndefined();
  });

  it("is idempotent: a second call for the same proposal returns the EXISTING row, not a new one", async () => {
    const { match, proposal } = await makeAcceptedProposal("clerk_cw_idempotent_a", "clerk_cw_idempotent_b");
    const opensAt = new Date(proposal.slotStartAt.getTime() - 60 * MINUTE_MS);
    const closesAt = new Date(proposal.slotStartAt.getTime() + 4 * HOUR_MS);

    const first = await createChatWindowIfNotExists(db, {
      matchId: match.id,
      dateProposalId: proposal.id,
      opensAt,
      closesAt,
    });

    // A different (later) opens_at/closes_at pair, as if the caller were
    // re-deriving the window from a changed slot — this must NOT overwrite
    // or duplicate the first window; a proposal's window is fixed once
    // created.
    const second = await createChatWindowIfNotExists(db, {
      matchId: match.id,
      dateProposalId: proposal.id,
      opensAt: new Date(opensAt.getTime() + HOUR_MS),
      closesAt: new Date(closesAt.getTime() + HOUR_MS),
    });

    expect(second.id).toBe(first.id);
    expect(second.opensAt.getTime()).toBe(first.opensAt.getTime());
    expect(second.closesAt.getTime()).toBe(first.closesAt.getTime());

    const rows = await db
      .select()
      .from(schema.chatWindows)
      .where(eq(schema.chatWindows.dateProposalId, proposal.id));
    expect(rows).toHaveLength(1);
  });

  it("two different locked proposals for the same match each get their own window", async () => {
    const a = await ensureUserForClerkId(db, "clerk_cw_two_a");
    const b = await ensureUserForClerkId(db, "clerk_cw_two_b");
    const match = await insertMatchIfNotExists(db, { userAId: a.id, userBId: b.id });

    const firstProposal = await createDateProposal(db, {
      matchId: match.id,
      proposedByUserId: a.id,
      ideaText: "First date",
      slotStartAt: at("09:00"),
      slotEndAt: at("10:00"),
    });
    await acceptDateProposal(db, firstProposal.id);
    const firstWindow = await createChatWindowIfNotExists(db, {
      matchId: match.id,
      dateProposalId: firstProposal.id,
      opensAt: new Date(firstProposal.slotStartAt.getTime() - 60 * MINUTE_MS),
      closesAt: new Date(firstProposal.slotStartAt.getTime() + 4 * HOUR_MS),
    });

    // SPEC.md §8: "closing a window and locking a next date... a fresh
    // chat window each time" — a second proposal for the SAME match gets
    // its own independent window row, not a reused/updated one.
    const secondProposal = await createDateProposal(db, {
      matchId: match.id,
      proposedByUserId: b.id,
      ideaText: "Second date",
      slotStartAt: at("20:00"),
      slotEndAt: at("21:00"),
    });
    await acceptDateProposal(db, secondProposal.id);
    const secondWindow = await createChatWindowIfNotExists(db, {
      matchId: match.id,
      dateProposalId: secondProposal.id,
      opensAt: new Date(secondProposal.slotStartAt.getTime() - 60 * MINUTE_MS),
      closesAt: new Date(secondProposal.slotStartAt.getTime() + 4 * HOUR_MS),
    });

    expect(secondWindow.id).not.toBe(firstWindow.id);
    expect((await getChatWindowByProposalId(db, firstProposal.id))?.id).toBe(firstWindow.id);
    expect((await getChatWindowByProposalId(db, secondProposal.id))?.id).toBe(secondWindow.id);
  });
});
