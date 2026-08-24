// ROADMAP.md M13: "Email fires for: ... proposal accepted." Asserts
// against the real composition point (lib/date-proposals/respond.ts's
// acceptDate) — notified recipient is the ORIGINAL PROPOSER, and decline
// deliberately fires nothing (ENGINEERING_SPEC §14 names only "proposal
// accepted").
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
import { acceptDate, declineDate } from "../date-proposals/respond";

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../packages/db/drizzle");

const at = (isoTime: string) => new Date(`2026-09-10T${isoTime}:00.000Z`);

describe("proposal-accepted notification", () => {
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

  it("acceptDate notifies the ORIGINAL PROPOSER — the one whose idea just got accepted, not the accepter", async () => {
    const { match, a, b } = await makeMatch("clerk_notify_accept_a", "clerk_notify_accept_b");
    const proposal = await proposeDate(db, match.id, a.id, {
      ideaText: "Coffee",
      slotStartAt: at("09:00"),
      slotEndAt: at("10:00"),
    });
    clearDevMockSentNotifications(); // drop the "new_date_proposal" send from proposeDate above

    await acceptDate(db, proposal.id, b.id);

    const sent = getDevMockSentNotifications().filter((s) => s.event.type === "date_proposal_accepted");
    expect(sent).toHaveLength(1);
    expect(sent[0]!.event).toMatchObject({
      type: "date_proposal_accepted",
      recipientEmail: `${a.clerkId}@dev.prompt-me.invalid`,
      matchId: match.id,
      proposalId: proposal.id,
      ideaText: "Coffee",
    });
  });

  it("declineDate fires no date_proposal_accepted notification at all", async () => {
    const { match, a, b } = await makeMatch("clerk_notify_decline_a", "clerk_notify_decline_b");
    const proposal = await proposeDate(db, match.id, a.id, {
      ideaText: "Bowling",
      slotStartAt: at("18:00"),
      slotEndAt: at("19:00"),
    });
    clearDevMockSentNotifications();

    await declineDate(db, proposal.id, b.id);

    expect(getDevMockSentNotifications().filter((s) => s.event.type === "date_proposal_accepted")).toHaveLength(0);
  });
});
