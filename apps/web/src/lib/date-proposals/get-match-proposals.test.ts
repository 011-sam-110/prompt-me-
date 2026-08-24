// The read side backing the planning page's proposal list — same guard
// (assertActiveMatchParticipant, factored into match-access.ts) as every
// other composition point in this directory.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "@prompt-me/db/schema";
import { blockMatch, ensurePromptsSeeded, ensureUserForClerkId, insertMatchIfNotExists } from "@prompt-me/db";
import { DateProposalMatchAccessError, DateProposalMatchNotActiveError, getMatchProposals } from "./get-match-proposals";
import { proposeDate } from "./propose";
import { acceptDate } from "./respond";
import { setDateVenue } from "./set-venue";

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../packages/db/drizzle");

const at = (isoTime: string) => new Date(`2026-09-10T${isoTime}:00.000Z`);

describe("getMatchProposals", () => {
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

  it("returns every proposal for the match plus the correctly labeled otherUserId, from either side", async () => {
    const { match, a, b } = await makeMatch("clerk_getprops_ok_a", "clerk_getprops_ok_b");
    await proposeDate(db, match.id, a, { ideaText: "x", slotStartAt: at("09:00"), slotEndAt: at("10:00") });

    const fromA = await getMatchProposals(db, match.id, a);
    expect(fromA.otherUserId).toBe(b);
    expect(fromA.proposals).toHaveLength(1);
    expect(fromA.proposals[0]!.locked).toBe(false);
    expect(fromA.proposals[0]!.venue).toBeNull();
    // Not yet locked -> no chat_windows row exists to point an "Open chat"
    // link at (ROADMAP.md M11's realtime half).
    expect(fromA.proposals[0]!.chatWindowId).toBeNull();

    const fromB = await getMatchProposals(db, match.id, b);
    expect(fromB.otherUserId).toBe(a);
    expect(fromB.proposals).toHaveLength(1);
  });

  it("annotates a locked proposal with locked: true and a resolved venue name/address", async () => {
    const { match, a, b } = await makeMatch("clerk_getprops_locked_a", "clerk_getprops_locked_b");
    const proposal = await proposeDate(db, match.id, a, {
      ideaText: "Coffee",
      slotStartAt: at("09:00"),
      slotEndAt: at("10:00"),
    });
    await acceptDate(db, proposal.id, b);
    await setDateVenue(db, proposal.id, b, "dev-mock-place-corner-cafe");

    const result = await getMatchProposals(db, match.id, a);
    const row = result.proposals.find((p) => p.id === proposal.id)!;
    expect(row.locked).toBe(true);
    expect(row.venue).toEqual({
      placeId: "dev-mock-place-corner-cafe",
      name: "The Corner Café",
      address: "12 Church Street",
      types: ["cafe", "food", "point_of_interest", "establishment"],
    });

    // ROADMAP.md M11's realtime half: a locked proposal resolves to the
    // exact chat_windows row set-venue.ts created for it.
    const [window] = await db.select().from(schema.chatWindows).where(eq(schema.chatWindows.dateProposalId, proposal.id));
    expect(row.chatWindowId).toBe(window!.id);
  });

  it("throws DateProposalMatchAccessError for a stranger, or a nonexistent matchId", async () => {
    const { match } = await makeMatch("clerk_getprops_stranger_a", "clerk_getprops_stranger_b");
    const stranger = await ensureUserForClerkId(db, "clerk_getprops_stranger_c");

    await expect(getMatchProposals(db, match.id, stranger.id)).rejects.toBeInstanceOf(DateProposalMatchAccessError);
    await expect(getMatchProposals(db, "00000000-0000-0000-0000-000000000000", stranger.id)).rejects.toBeInstanceOf(
      DateProposalMatchAccessError,
    );
  });

  it("throws DateProposalMatchNotActiveError once the pair has been Escaped", async () => {
    const { match, a } = await makeMatch("clerk_getprops_blocked_a", "clerk_getprops_blocked_b");
    await blockMatch(db, { userAId: match.userAId, userBId: match.userBId });

    await expect(getMatchProposals(db, match.id, a)).rejects.toBeInstanceOf(DateProposalMatchNotActiveError);
  });

  it("never leaks another match's proposals", async () => {
    const { match, a } = await makeMatch("clerk_getprops_isolated_a", "clerk_getprops_isolated_b");
    const { match: otherMatch, a: otherA } = await makeMatch("clerk_getprops_isolated_other_a", "clerk_getprops_isolated_other_b");
    await proposeDate(db, otherMatch.id, otherA, { ideaText: "x", slotStartAt: at("09:00"), slotEndAt: at("10:00") });

    const result = await getMatchProposals(db, match.id, a);
    expect(result.proposals).toHaveLength(0);
  });
});
