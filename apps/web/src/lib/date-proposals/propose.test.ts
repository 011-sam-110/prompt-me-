// ROADMAP.md M9's proposal-half acceptance bullet: "Propose/accept/decline
// flow with unlimited re-proposals." This file covers propose.ts; respond.test.ts
// covers accept/decline + locking, set-venue.test.ts covers the venue guard.
// Same integration-test shape as ../calendar/get-match-calendar.test.ts —
// real (PGlite) database, real migrations.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@prompt-me/db/schema";
import { blockMatch, ensurePromptsSeeded, ensureUserForClerkId, insertMatchIfNotExists } from "@prompt-me/db";
import { DateProposalMatchAccessError, DateProposalMatchNotActiveError } from "./match-access";
import { InvalidIdeaTextError, InvalidProposalSlotRangeError, proposeDate } from "./propose";

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../packages/db/drizzle");

const at = (isoTime: string) => new Date(`2026-09-10T${isoTime}:00.000Z`);

describe("proposeDate", () => {
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

  async function makeMatch(clerkIdA: string, clerkIdB: string) {
    const a = await ensureUserForClerkId(db, clerkIdA);
    const b = await ensureUserForClerkId(db, clerkIdB);
    const match = await insertMatchIfNotExists(db, { userAId: a.id, userBId: b.id });
    return { match, a: a.id, b: b.id };
  }

  it("creates a pending, custom-idea proposal for a real participant of an active match", async () => {
    const { match, a } = await makeMatch("clerk_propose_ok_a", "clerk_propose_ok_b");

    const proposal = await proposeDate(db, match.id, a, {
      ideaText: "  Coffee at the corner café  ",
      slotStartAt: at("09:00"),
      slotEndAt: at("10:00"),
    });

    expect(proposal.status).toBe("pending");
    expect(proposal.ideaSource).toBe("custom");
    // trimmed
    expect(proposal.ideaText).toBe("Coffee at the corner café");
    expect(proposal.venuePlaceId).toBeNull();
    expect(proposal.proposedByUserId).toBe(a);
  });

  it("either side of the match may propose", async () => {
    const { match, b } = await makeMatch("clerk_propose_otherside_a", "clerk_propose_otherside_b");

    const proposal = await proposeDate(db, match.id, b, {
      ideaText: "Museum afternoon",
      slotStartAt: at("13:00"),
      slotEndAt: at("15:00"),
    });
    expect(proposal.proposedByUserId).toBe(b);
  });

  it("rejects a proposer who isn't a participant in the match", async () => {
    const { match } = await makeMatch("clerk_propose_stranger_a", "clerk_propose_stranger_b");
    const stranger = await ensureUserForClerkId(db, "clerk_propose_stranger_c");

    await expect(
      proposeDate(db, match.id, stranger.id, {
        ideaText: "Should never be written",
        slotStartAt: at("09:00"),
        slotEndAt: at("10:00"),
      }),
    ).rejects.toBeInstanceOf(DateProposalMatchAccessError);
  });

  it("rejects a matchId that doesn't exist at all", async () => {
    const a = await ensureUserForClerkId(db, "clerk_propose_nomatch_a");
    await expect(
      proposeDate(db, "00000000-0000-0000-0000-000000000000", a.id, {
        ideaText: "x",
        slotStartAt: at("09:00"),
        slotEndAt: at("10:00"),
      }),
    ).rejects.toBeInstanceOf(DateProposalMatchAccessError);
  });

  it("rejects proposing on an Escaped (blocked) match", async () => {
    const { match, a } = await makeMatch("clerk_propose_blocked_a", "clerk_propose_blocked_b");
    await blockMatch(db, { userAId: match.userAId, userBId: match.userBId });

    await expect(
      proposeDate(db, match.id, a, { ideaText: "x", slotStartAt: at("09:00"), slotEndAt: at("10:00") }),
    ).rejects.toBeInstanceOf(DateProposalMatchNotActiveError);
  });

  it("rejects an empty (or whitespace-only) idea, before touching the database", async () => {
    const { match, a } = await makeMatch("clerk_propose_emptyidea_a", "clerk_propose_emptyidea_b");

    await expect(
      proposeDate(db, match.id, a, { ideaText: "   ", slotStartAt: at("09:00"), slotEndAt: at("10:00") }),
    ).rejects.toBeInstanceOf(InvalidIdeaTextError);
  });

  it("rejects an invalid slot range (end not after start)", async () => {
    const { match, a } = await makeMatch("clerk_propose_badrange_a", "clerk_propose_badrange_b");

    await expect(
      proposeDate(db, match.id, a, { ideaText: "x", slotStartAt: at("10:00"), slotEndAt: at("09:00") }),
    ).rejects.toBeInstanceOf(InvalidProposalSlotRangeError);
  });
});
