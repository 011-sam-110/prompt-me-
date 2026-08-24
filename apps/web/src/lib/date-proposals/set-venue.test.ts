// ROADMAP.md M9: "Build the meeting-place picker restricted to Google
// Places results of clearly public venue types only... with NO free-text
// address field that could bypass it" and "A date is 'locked' only once
// idea + slot + venue are all accepted together." This file proves both,
// through the real composition layer against a real (PGlite) database: a
// valid public-venue place locks the date; a disallowed-type place_id
// submitted DIRECTLY to setDateVenue (as if the picker's own "no free-text
// field" guarantee had been bypassed some other way) is rejected server-side,
// not just hidden from the UI.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@prompt-me/db/schema";
import { DateProposalNotAcceptedError, ensurePromptsSeeded, ensureUserForClerkId, insertMatchIfNotExists } from "@prompt-me/db";
import { isDateProposalLocked } from "@prompt-me/core";
import { proposeDate } from "./propose";
import { acceptDate, declineDate } from "./respond";
import { InvalidVenueError, setDateVenue } from "./set-venue";

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../packages/db/drizzle");

const at = (isoTime: string) => new Date(`2026-09-10T${isoTime}:00.000Z`);

describe("setDateVenue", () => {
  let client: PGlite;
  let db: PgliteDatabase<typeof schema>;

  beforeAll(async () => {
    client = new PGlite();
    db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder });
    await ensurePromptsSeeded(db);
    // No GOOGLE_PLACES_API_KEY is set in the test env, so
    // getPlacesProvider() resolves to DevMockPlacesProvider throughout this
    // file (ROADMAP.md M9's own "dev-mock place list if no key is present").
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

  it("attaching a real, allowed public-venue place to an accepted proposal locks the date — idea + slot + venue all agreed together", async () => {
    const { match, a, b } = await makeMatch("clerk_venue_lock_a", "clerk_venue_lock_b");
    const proposal = await proposeDate(db, match.id, a, {
      ideaText: "Coffee at the corner café",
      slotStartAt: at("09:00"),
      slotEndAt: at("10:00"),
    });
    const accepted = await acceptDate(db, proposal.id, b);
    // sanity: right after accept, still no venue -> not locked yet.
    expect(isDateProposalLocked(accepted)).toBe(false);

    const withVenue = await setDateVenue(db, proposal.id, b, "dev-mock-place-corner-cafe");

    expect(withVenue.venuePlaceId).toBe("dev-mock-place-corner-cafe");
    expect(withVenue.status).toBe("accepted");
    expect(isDateProposalLocked(withVenue)).toBe(true);
  });

  it("rejects a venuePlaceId that resolves to a real place of a DISALLOWED type (the bypass attempt) — even submitted directly, skipping the picker", async () => {
    const { match, a, b } = await makeMatch("clerk_venue_disallowed_a", "clerk_venue_disallowed_b");
    const proposal = await proposeDate(db, match.id, a, {
      ideaText: "x",
      slotStartAt: at("09:00"),
      slotEndAt: at("10:00"),
    });
    await acceptDate(db, proposal.id, b);

    // "dev-mock-place-disallowed-lodging" is a real, resolvable place (a
    // hotel) in @prompt-me/core's DevMockPlacesProvider — reachable only via
    // getPlace, never surfaced by the picker's own searchVenues. Submitting
    // its id straight to setDateVenue models exactly the bypass ROADMAP.md
    // M9 asks to be closed.
    await expect(setDateVenue(db, proposal.id, b, "dev-mock-place-disallowed-lodging")).rejects.toBeInstanceOf(
      InvalidVenueError,
    );

    const rows = await db.select().from(schema.dateProposals);
    const stillNoVenue = rows.find((r) => r.id === proposal.id);
    expect(stillNoVenue!.venuePlaceId).toBeNull();
    expect(isDateProposalLocked(stillNoVenue!)).toBe(false);
  });

  it("rejects a venuePlaceId that doesn't resolve to any place at all (a made-up id)", async () => {
    const { match, a, b } = await makeMatch("clerk_venue_madeup_a", "clerk_venue_madeup_b");
    const proposal = await proposeDate(db, match.id, a, {
      ideaText: "x",
      slotStartAt: at("09:00"),
      slotEndAt: at("10:00"),
    });
    await acceptDate(db, proposal.id, b);

    await expect(setDateVenue(db, proposal.id, b, "totally-made-up-id")).rejects.toBeInstanceOf(InvalidVenueError);
  });

  it("cannot attach a venue to a still-pending proposal — accept must come first", async () => {
    const { match, a } = await makeMatch("clerk_venue_pending_a", "clerk_venue_pending_b");
    const proposal = await proposeDate(db, match.id, a, {
      ideaText: "x",
      slotStartAt: at("09:00"),
      slotEndAt: at("10:00"),
    });

    await expect(setDateVenue(db, proposal.id, a, "dev-mock-place-corner-cafe")).rejects.toBeInstanceOf(
      DateProposalNotAcceptedError,
    );
  });

  it("cannot attach a venue to a declined proposal", async () => {
    const { match, a, b } = await makeMatch("clerk_venue_declined_a", "clerk_venue_declined_b");
    const proposal = await proposeDate(db, match.id, a, {
      ideaText: "x",
      slotStartAt: at("09:00"),
      slotEndAt: at("10:00"),
    });
    await declineDate(db, proposal.id, b);

    await expect(setDateVenue(db, proposal.id, b, "dev-mock-place-corner-cafe")).rejects.toBeInstanceOf(
      DateProposalNotAcceptedError,
    );
  });
});
