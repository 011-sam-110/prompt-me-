// ROADMAP.md M9 / ENGINEERING_SPEC.md §2/§9, SPEC.md §6. Same
// PGlite-against-the-real-migration pattern as matches.test.ts. Purely
// mechanical coverage — the "who's allowed to do this" domain rules live in
// apps/web's lib/date-proposals/* (its own integration tests); this file
// only proves the query functions read/write the right rows, with the
// pending→accepted/declined and accepted→venue-set transitions enforced by
// each function's own WHERE clause.
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
import { insertGeneratedDateIdeas } from "./date-ideas";
import {
  DateProposalNotAcceptedError,
  DateProposalNotPendingError,
  acceptDateProposal,
  createDateProposal,
  createGeneratedDateProposal,
  declineDateProposal,
  getDateProposalById,
  getDateProposalsForMatch,
  setDateProposalVenue,
} from "./date-proposals";

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../drizzle");

const at = (isoTime: string) => new Date(`2026-09-10T${isoTime}:00.000Z`);

describe("date_proposals queries", () => {
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

  it("createDateProposal inserts a pending, custom-idea, venue-less row", async () => {
    const { match, a } = await makeMatch("clerk_dp_create_a", "clerk_dp_create_b");

    const proposal = await createDateProposal(db, {
      matchId: match.id,
      proposedByUserId: a,
      ideaText: "Coffee and a walk by the river",
      slotStartAt: at("09:00"),
      slotEndAt: at("10:00"),
    });

    expect(proposal.matchId).toBe(match.id);
    expect(proposal.proposedByUserId).toBe(a);
    expect(proposal.ideaSource).toBe("custom");
    expect(proposal.ideaText).toBe("Coffee and a walk by the river");
    expect(proposal.status).toBe("pending");
    expect(proposal.venuePlaceId).toBeNull();
    expect(proposal.generatedIdeaId).toBeNull();
  });

  it("createGeneratedDateProposal inserts a pending, generated-idea row referencing its cached idea", async () => {
    const { match, a } = await makeMatch("clerk_dp_generated_a", "clerk_dp_generated_b");
    const [idea] = await insertGeneratedDateIdeas(db, match.id, [
      { ideaText: "Coffee at the corner café", rationale: "Both mentioned coffee." },
      { ideaText: "Walk in the botanic gardens", rationale: "Both mentioned nature." },
    ]);

    const proposal = await createGeneratedDateProposal(db, {
      matchId: match.id,
      proposedByUserId: a,
      generatedIdeaId: idea!.id,
      ideaText: idea!.ideaText,
      slotStartAt: at("09:00"),
      slotEndAt: at("10:00"),
    });

    expect(proposal.ideaSource).toBe("generated");
    expect(proposal.generatedIdeaId).toBe(idea!.id);
    expect(proposal.ideaText).toBe(idea!.ideaText);
    expect(proposal.status).toBe("pending");
  });

  it("getDateProposalById returns the row, and undefined for a nonexistent id", async () => {
    const { match, a } = await makeMatch("clerk_dp_getbyid_a", "clerk_dp_getbyid_b");
    const created = await createDateProposal(db, {
      matchId: match.id,
      proposedByUserId: a,
      ideaText: "Museum visit",
      slotStartAt: at("11:00"),
      slotEndAt: at("12:00"),
    });

    expect((await getDateProposalById(db, created.id))?.id).toBe(created.id);
    expect(await getDateProposalById(db, "00000000-0000-0000-0000-000000000000")).toBeUndefined();
  });

  it("getDateProposalsForMatch returns every proposal for the match, newest first, and none of another match's", async () => {
    const { match, a } = await makeMatch("clerk_dp_list_a", "clerk_dp_list_b");
    const { match: otherMatch, a: otherA } = await makeMatch("clerk_dp_list_other_a", "clerk_dp_list_other_b");

    const first = await createDateProposal(db, {
      matchId: match.id,
      proposedByUserId: a,
      ideaText: "First idea",
      slotStartAt: at("09:00"),
      slotEndAt: at("10:00"),
    });
    const second = await createDateProposal(db, {
      matchId: match.id,
      proposedByUserId: a,
      ideaText: "Second idea (re-proposed)",
      slotStartAt: at("14:00"),
      slotEndAt: at("15:00"),
    });
    await createDateProposal(db, {
      matchId: otherMatch.id,
      proposedByUserId: otherA,
      ideaText: "Unrelated match's idea",
      slotStartAt: at("09:00"),
      slotEndAt: at("10:00"),
    });

    const rows = await getDateProposalsForMatch(db, match.id);
    expect(rows.map((r) => r.id)).toEqual([second.id, first.id]);
  });

  it("acceptDateProposal flips pending -> accepted, and rejects an already-responded-to row", async () => {
    const { match, a } = await makeMatch("clerk_dp_accept_a", "clerk_dp_accept_b");
    const proposal = await createDateProposal(db, {
      matchId: match.id,
      proposedByUserId: a,
      ideaText: "Bowling",
      slotStartAt: at("18:00"),
      slotEndAt: at("19:00"),
    });

    const accepted = await acceptDateProposal(db, proposal.id);
    expect(accepted.status).toBe("accepted");
    expect(accepted.venuePlaceId).toBeNull();

    await expect(acceptDateProposal(db, proposal.id)).rejects.toBeInstanceOf(DateProposalNotPendingError);
  });

  it("declineDateProposal flips pending -> declined, and rejects an already-responded-to row", async () => {
    const { match, a } = await makeMatch("clerk_dp_decline_a", "clerk_dp_decline_b");
    const proposal = await createDateProposal(db, {
      matchId: match.id,
      proposedByUserId: a,
      ideaText: "Rooftop dinner",
      slotStartAt: at("19:00"),
      slotEndAt: at("20:30"),
    });

    const declined = await declineDateProposal(db, proposal.id);
    expect(declined.status).toBe("declined");

    await expect(declineDateProposal(db, proposal.id)).rejects.toBeInstanceOf(DateProposalNotPendingError);
    await expect(acceptDateProposal(db, proposal.id)).rejects.toBeInstanceOf(DateProposalNotPendingError);
  });

  it("declining never touches the matches row — no unmatch side effect at this layer", async () => {
    const { match, a } = await makeMatch("clerk_dp_decline_nounmatch_a", "clerk_dp_decline_nounmatch_b");
    const proposal = await createDateProposal(db, {
      matchId: match.id,
      proposedByUserId: a,
      ideaText: "Picnic in the park",
      slotStartAt: at("12:00"),
      slotEndAt: at("13:00"),
    });

    await declineDateProposal(db, proposal.id);

    const [row] = await db.select().from(schema.matches).where(eq(schema.matches.id, match.id));
    expect(row!.status).toBe("active");
  });

  it("unlimited re-proposals: after a decline, a fresh pending proposal can still be created for the same match", async () => {
    const { match, a } = await makeMatch("clerk_dp_reprop_a", "clerk_dp_reprop_b");
    const first = await createDateProposal(db, {
      matchId: match.id,
      proposedByUserId: a,
      ideaText: "Original idea",
      slotStartAt: at("09:00"),
      slotEndAt: at("10:00"),
    });
    await declineDateProposal(db, first.id);

    const second = await createDateProposal(db, {
      matchId: match.id,
      proposedByUserId: a,
      ideaText: "Re-proposed idea",
      slotStartAt: at("15:00"),
      slotEndAt: at("16:00"),
    });
    expect(second.status).toBe("pending");

    const rows = await getDateProposalsForMatch(db, match.id);
    expect(rows).toHaveLength(2);
  });

  it("setDateProposalVenue attaches a venue only to an accepted row, and rejects a still-pending one", async () => {
    const { match, a } = await makeMatch("clerk_dp_venue_a", "clerk_dp_venue_b");
    const proposal = await createDateProposal(db, {
      matchId: match.id,
      proposedByUserId: a,
      ideaText: "Café catch-up",
      slotStartAt: at("10:00"),
      slotEndAt: at("11:00"),
    });

    await expect(setDateProposalVenue(db, proposal.id, "dev-mock-place-corner-cafe")).rejects.toBeInstanceOf(
      DateProposalNotAcceptedError,
    );

    await acceptDateProposal(db, proposal.id);
    const withVenue = await setDateProposalVenue(db, proposal.id, "dev-mock-place-corner-cafe");
    expect(withVenue.venuePlaceId).toBe("dev-mock-place-corner-cafe");
    expect(withVenue.status).toBe("accepted");
  });

  it("setDateProposalVenue rejects a declined row too", async () => {
    const { match, a } = await makeMatch("clerk_dp_venue_declined_a", "clerk_dp_venue_declined_b");
    const proposal = await createDateProposal(db, {
      matchId: match.id,
      proposedByUserId: a,
      ideaText: "Zoo trip",
      slotStartAt: at("10:00"),
      slotEndAt: at("11:00"),
    });
    await declineDateProposal(db, proposal.id);

    await expect(setDateProposalVenue(db, proposal.id, "dev-mock-place-riverside-museum")).rejects.toBeInstanceOf(
      DateProposalNotAcceptedError,
    );
  });
});
