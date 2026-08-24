// ROADMAP.md M13: "Email fires for: new date proposal." Asserts against
// BOTH real composition points that create a date_proposals row —
// lib/date-proposals/propose.ts's proposeDate (custom idea text) and
// lib/date-ideas/propose-generated.ts's proposeGeneratedDate (a generated
// idea) — since SPEC.md draws no distinction between the two once
// proposed (notify-new-proposal.ts's own header comment).
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@prompt-me/db/schema";
import { ensurePromptsSeeded, ensureUserForClerkId, insertMatchIfNotExists } from "@prompt-me/db";
import { clearDevMockSentNotifications, getDevMockSentNotifications } from "@prompt-me/core";
import { proposeDate } from "../date-proposals/propose";
import { getOrGenerateIdeas } from "../date-ideas/get-or-generate-ideas";
import { proposeGeneratedDate } from "../date-ideas/propose-generated";

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../packages/db/drizzle");

const at = (isoTime: string) => new Date(`2026-09-10T${isoTime}:00.000Z`);

describe("new-date-proposal notification", () => {
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

  beforeEach(() => {
    clearDevMockSentNotifications();
  });

  async function makeMatch(clerkIdA: string, clerkIdB: string) {
    const a = await ensureUserForClerkId(db, clerkIdA);
    const b = await ensureUserForClerkId(db, clerkIdB);
    const match = await insertMatchIfNotExists(db, { userAId: a.id, userBId: b.id });
    return { match, a, b };
  }

  it("proposeDate (custom idea text) notifies only the OTHER participant, never the proposer", async () => {
    const { match, a, b } = await makeMatch("clerk_notify_prop_custom_a", "clerk_notify_prop_custom_b");

    const proposal = await proposeDate(db, match.id, a.id, {
      ideaText: "Coffee at the corner café",
      slotStartAt: at("09:00"),
      slotEndAt: at("10:00"),
    });

    const sent = getDevMockSentNotifications().filter((s) => s.event.type === "new_date_proposal");
    expect(sent).toHaveLength(1);
    expect(sent[0]!.event).toMatchObject({
      type: "new_date_proposal",
      recipientEmail: `${b.clerkId}@dev.prompt-me.invalid`,
      matchId: match.id,
      proposalId: proposal.id,
      ideaText: "Coffee at the corner café",
    });
  });

  it("proposeGeneratedDate (generated idea) fires the identical notification", async () => {
    const { match, a, b } = await makeMatch("clerk_notify_prop_gen_a", "clerk_notify_prop_gen_b");
    const [idea] = await getOrGenerateIdeas(db, match.id, b.id);

    const proposal = await proposeGeneratedDate(db, match.id, b.id, {
      generatedIdeaId: idea!.id,
      slotStartAt: at("13:00"),
      slotEndAt: at("15:00"),
    });

    const sent = getDevMockSentNotifications().filter((s) => s.event.type === "new_date_proposal");
    expect(sent).toHaveLength(1);
    expect(sent[0]!.event).toMatchObject({
      type: "new_date_proposal",
      recipientEmail: `${a.clerkId}@dev.prompt-me.invalid`,
      matchId: match.id,
      proposalId: proposal.id,
    });
  });

  it("either side proposing notifies whichever side did NOT propose", async () => {
    const { match, a, b } = await makeMatch("clerk_notify_prop_otherside_a", "clerk_notify_prop_otherside_b");

    await proposeDate(db, match.id, b.id, {
      ideaText: "Bowling",
      slotStartAt: at("18:00"),
      slotEndAt: at("19:00"),
    });

    const sent = getDevMockSentNotifications().filter((s) => s.event.type === "new_date_proposal");
    expect(sent).toHaveLength(1);
    expect(sent[0]!.event.recipientEmail).toBe(`${a.clerkId}@dev.prompt-me.invalid`);
  });
});
