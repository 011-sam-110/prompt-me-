// ROADMAP.md M10: "generated ideas are selectable alongside custom ones."
// Same integration-test shape as ../date-proposals/propose.test.ts — real
// (PGlite) database, real migrations.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@prompt-me/db/schema";
import { blockMatch, ensurePromptsSeeded, ensureUserForClerkId, insertMatchIfNotExists } from "@prompt-me/db";
import { getOrGenerateIdeas } from "./get-or-generate-ideas";
import { GeneratedIdeaNotFoundError, proposeGeneratedDate } from "./propose-generated";
import { DateProposalMatchAccessError, DateProposalMatchNotActiveError } from "../date-proposals/match-access";
import { InvalidProposalSlotRangeError } from "../date-proposals/propose";

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../packages/db/drizzle");

const at = (isoTime: string) => new Date(`2026-09-10T${isoTime}:00.000Z`);

describe("proposeGeneratedDate", () => {
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

  it("creates a pending, generated-idea proposal referencing the picked cached idea", async () => {
    const { match, a } = await makeMatch("clerk_propgen_ok_a", "clerk_propgen_ok_b");
    const [idea] = await getOrGenerateIdeas(db, match.id, a);

    const proposal = await proposeGeneratedDate(db, match.id, a, {
      generatedIdeaId: idea!.id,
      slotStartAt: at("09:00"),
      slotEndAt: at("10:00"),
    });

    expect(proposal.status).toBe("pending");
    expect(proposal.ideaSource).toBe("generated");
    expect(proposal.generatedIdeaId).toBe(idea!.id);
    expect(proposal.ideaText).toBe(idea!.ideaText);
    expect(proposal.proposedByUserId).toBe(a);
  });

  it("either side of the match may propose a generated idea", async () => {
    const { match, b } = await makeMatch("clerk_propgen_otherside_a", "clerk_propgen_otherside_b");
    const [idea] = await getOrGenerateIdeas(db, match.id, b);

    const proposal = await proposeGeneratedDate(db, match.id, b, {
      generatedIdeaId: idea!.id,
      slotStartAt: at("13:00"),
      slotEndAt: at("15:00"),
    });
    expect(proposal.proposedByUserId).toBe(b);
  });

  it("rejects a generated-idea id that belongs to a different match", async () => {
    const { match, a } = await makeMatch("clerk_propgen_wrongmatch_a", "clerk_propgen_wrongmatch_b");
    const { match: otherMatch, a: otherA } = await makeMatch("clerk_propgen_wrongmatch_other_a", "clerk_propgen_wrongmatch_other_b");
    const [foreignIdea] = await getOrGenerateIdeas(db, otherMatch.id, otherA);

    await expect(
      proposeGeneratedDate(db, match.id, a, {
        generatedIdeaId: foreignIdea!.id,
        slotStartAt: at("09:00"),
        slotEndAt: at("10:00"),
      }),
    ).rejects.toBeInstanceOf(GeneratedIdeaNotFoundError);
  });

  it("rejects a nonexistent generated-idea id", async () => {
    const { match, a } = await makeMatch("clerk_propgen_missing_a", "clerk_propgen_missing_b");

    await expect(
      proposeGeneratedDate(db, match.id, a, {
        generatedIdeaId: "00000000-0000-0000-0000-000000000000",
        slotStartAt: at("09:00"),
        slotEndAt: at("10:00"),
      }),
    ).rejects.toBeInstanceOf(GeneratedIdeaNotFoundError);
  });

  it("rejects a proposer who isn't a participant in the match", async () => {
    const { match, a } = await makeMatch("clerk_propgen_stranger_a", "clerk_propgen_stranger_b");
    const [idea] = await getOrGenerateIdeas(db, match.id, a);
    const stranger = await ensureUserForClerkId(db, "clerk_propgen_stranger_c");

    await expect(
      proposeGeneratedDate(db, match.id, stranger.id, {
        generatedIdeaId: idea!.id,
        slotStartAt: at("09:00"),
        slotEndAt: at("10:00"),
      }),
    ).rejects.toBeInstanceOf(DateProposalMatchAccessError);
  });

  it("rejects proposing on an Escaped (blocked) match", async () => {
    const { match, a } = await makeMatch("clerk_propgen_blocked_a", "clerk_propgen_blocked_b");
    const [idea] = await getOrGenerateIdeas(db, match.id, a);
    await blockMatch(db, { userAId: match.userAId, userBId: match.userBId });

    await expect(
      proposeGeneratedDate(db, match.id, a, {
        generatedIdeaId: idea!.id,
        slotStartAt: at("09:00"),
        slotEndAt: at("10:00"),
      }),
    ).rejects.toBeInstanceOf(DateProposalMatchNotActiveError);
  });

  it("rejects an invalid slot range (end not after start)", async () => {
    const { match, a } = await makeMatch("clerk_propgen_badrange_a", "clerk_propgen_badrange_b");
    const [idea] = await getOrGenerateIdeas(db, match.id, a);

    await expect(
      proposeGeneratedDate(db, match.id, a, {
        generatedIdeaId: idea!.id,
        slotStartAt: at("10:00"),
        slotEndAt: at("09:00"),
      }),
    ).rejects.toBeInstanceOf(InvalidProposalSlotRangeError);
  });
});
