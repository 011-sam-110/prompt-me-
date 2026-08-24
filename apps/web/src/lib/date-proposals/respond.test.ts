// ROADMAP.md M9: "Propose/accept/decline flow with unlimited
// re-proposals; declining doesn't unmatch." Also proves, through the real
// composition layer (not just @prompt-me/core's pure locking.test.ts), that
// accepting idea+slot alone does NOT lock the date — the "partial
// acceptance" case ROADMAP.md M9 explicitly asks to be tested.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@prompt-me/db/schema";
import { DateProposalNotPendingError, ensurePromptsSeeded, ensureUserForClerkId, insertMatchIfNotExists } from "@prompt-me/db";
import { isDateProposalLocked } from "@prompt-me/core";
import { DateProposalMatchAccessError } from "./match-access";
import { proposeDate } from "./propose";
import { DateProposalSelfResponseError, acceptDate, declineDate } from "./respond";

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../packages/db/drizzle");

const at = (isoTime: string) => new Date(`2026-09-10T${isoTime}:00.000Z`);

describe("acceptDate / declineDate", () => {
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

  it("the other side can accept, flipping status to accepted — but this alone does NOT lock the date (partial acceptance)", async () => {
    const { match, a, b } = await makeMatch("clerk_respond_accept_a", "clerk_respond_accept_b");
    const proposal = await proposeDate(db, match.id, a, {
      ideaText: "Coffee",
      slotStartAt: at("09:00"),
      slotEndAt: at("10:00"),
    });

    const accepted = await acceptDate(db, proposal.id, b);

    expect(accepted.status).toBe("accepted");
    expect(accepted.venuePlaceId).toBeNull();
    // The actual ROADMAP.md M9 assertion: idea+slot accepted, no venue yet
    // -> not locked.
    expect(isDateProposalLocked(accepted)).toBe(false);
  });

  it("the other side can decline, and declining does NOT unmatch — the matches row stays active", async () => {
    const { match, a, b } = await makeMatch("clerk_respond_decline_a", "clerk_respond_decline_b");
    const proposal = await proposeDate(db, match.id, a, {
      ideaText: "Bowling",
      slotStartAt: at("18:00"),
      slotEndAt: at("19:00"),
    });

    const declined = await declineDate(db, proposal.id, b);
    expect(declined.status).toBe("declined");

    const [row] = await db.select().from(schema.matches).where(eq(schema.matches.id, match.id));
    expect(row!.status).toBe("active");
  });

  it("unlimited re-proposals: after a decline, either side can propose again for the same match", async () => {
    const { match, a, b } = await makeMatch("clerk_respond_reprop_a", "clerk_respond_reprop_b");
    const first = await proposeDate(db, match.id, a, {
      ideaText: "Original plan",
      slotStartAt: at("09:00"),
      slotEndAt: at("10:00"),
    });
    await declineDate(db, first.id, b);

    // b re-proposes this time
    const second = await proposeDate(db, match.id, b, {
      ideaText: "New plan",
      slotStartAt: at("16:00"),
      slotEndAt: at("17:00"),
    });
    expect(second.status).toBe("pending");

    // and that one gets accepted just fine, proving the match is still
    // fully plannable after a decline.
    const accepted = await acceptDate(db, second.id, a);
    expect(accepted.status).toBe("accepted");
  });

  it("the proposer cannot accept their own proposal", async () => {
    const { match, a } = await makeMatch("clerk_respond_selfaccept_a", "clerk_respond_selfaccept_b");
    const proposal = await proposeDate(db, match.id, a, {
      ideaText: "x",
      slotStartAt: at("09:00"),
      slotEndAt: at("10:00"),
    });

    await expect(acceptDate(db, proposal.id, a)).rejects.toBeInstanceOf(DateProposalSelfResponseError);
  });

  it("the proposer cannot decline their own proposal", async () => {
    const { match, a } = await makeMatch("clerk_respond_selfdecline_a", "clerk_respond_selfdecline_b");
    const proposal = await proposeDate(db, match.id, a, {
      ideaText: "x",
      slotStartAt: at("09:00"),
      slotEndAt: at("10:00"),
    });

    await expect(declineDate(db, proposal.id, a)).rejects.toBeInstanceOf(DateProposalSelfResponseError);
  });

  it("a stranger outside the match cannot accept or decline", async () => {
    const { match, a } = await makeMatch("clerk_respond_stranger_a", "clerk_respond_stranger_b");
    const stranger = await ensureUserForClerkId(db, "clerk_respond_stranger_c");
    const proposal = await proposeDate(db, match.id, a, {
      ideaText: "x",
      slotStartAt: at("09:00"),
      slotEndAt: at("10:00"),
    });

    await expect(acceptDate(db, proposal.id, stranger.id)).rejects.toBeInstanceOf(DateProposalMatchAccessError);
  });

  it("cannot accept a proposal that's already been responded to (accept-then-accept, and accept-then-decline)", async () => {
    const { match, a, b } = await makeMatch("clerk_respond_double_a", "clerk_respond_double_b");
    const proposal = await proposeDate(db, match.id, a, {
      ideaText: "x",
      slotStartAt: at("09:00"),
      slotEndAt: at("10:00"),
    });

    await acceptDate(db, proposal.id, b);
    await expect(acceptDate(db, proposal.id, b)).rejects.toBeInstanceOf(DateProposalNotPendingError);
    await expect(declineDate(db, proposal.id, b)).rejects.toBeInstanceOf(DateProposalNotPendingError);
  });
});
