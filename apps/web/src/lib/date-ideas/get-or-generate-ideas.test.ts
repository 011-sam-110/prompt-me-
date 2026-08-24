// ROADMAP.md M10's acceptance bullets: "Ideas are cached in
// date_ideas_generated per match, not regenerated per proposal" and "A
// 'suggest new ideas' action forces regeneration." Same integration-test
// shape as ../date-proposals/propose.test.ts — real (PGlite) database, real
// migrations. No ANTHROPIC_API_KEY is set anywhere in this suite, so every
// call here exercises get-provider.ts's dev-mock branch — the same "no real
// credentials configured, and that's fine" state ROADMAP.md -> Needs from
// Sampo documents for the whole repo today.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@prompt-me/db/schema";
import {
  blockMatch,
  ensurePromptsSeeded,
  ensureUserForClerkId,
  insertClip,
  insertMatchIfNotExists,
  updateClipTranscript,
  updateUserGeohash,
} from "@prompt-me/db";
import { DEV_MOCK_DATE_IDEAS } from "@prompt-me/core";
import { DateProposalMatchAccessError, DateProposalMatchNotActiveError } from "../date-proposals/match-access";
import { getOrGenerateIdeas } from "./get-or-generate-ideas";

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../packages/db/drizzle");

describe("getOrGenerateIdeas", () => {
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

  async function makeMatchWithTranscripts(clerkIdA: string, clerkIdB: string) {
    const a = await ensureUserForClerkId(db, clerkIdA);
    const b = await ensureUserForClerkId(db, clerkIdB);
    const match = await insertMatchIfNotExists(db, { userAId: a.id, userBId: b.id });

    const clipA = await insertClip(db, {
      userId: a.id,
      tier: 1,
      durationSeconds: 12,
      storageUrl: `dev-blob://clips/${a.id}/tier-1.webm`,
      customPromptText: "What's your ideal Saturday?",
    });
    await updateClipTranscript(db, clipA.id, "I love hiking and terrible puns.");

    const clipB = await insertClip(db, {
      userId: b.id,
      tier: 1,
      durationSeconds: 14,
      storageUrl: `dev-blob://clips/${b.id}/tier-1.webm`,
      customPromptText: "What's your ideal Saturday?",
    });
    await updateClipTranscript(db, clipB.id, "Coffee snob, plays the violin badly.");

    return { match, a: a.id, b: b.id };
  }

  it("generates a fresh pair of exactly two ideas on first call, and caches them", async () => {
    const { match } = await makeMatchWithTranscripts("clerk_gen_first_a", "clerk_gen_first_b");

    const ideas = await getOrGenerateIdeas(db, match.id, match.userAId);

    expect(ideas).toHaveLength(2);
    for (const idea of ideas) {
      expect(idea.matchId).toBe(match.id);
      expect(idea.ideaText.length).toBeGreaterThan(0);
      expect(idea.rationale.length).toBeGreaterThan(0);
      // Dev-mock path, since no ANTHROPIC_API_KEY is set anywhere in this suite.
      expect(idea.ideaText).toContain("[DEV MOCK]");
    }
  });

  it("does not regenerate on a second call — returns the identical cached pair", async () => {
    const { match } = await makeMatchWithTranscripts("clerk_gen_cache_a", "clerk_gen_cache_b");

    const first = await getOrGenerateIdeas(db, match.id, match.userAId);
    const second = await getOrGenerateIdeas(db, match.id, match.userBId);

    expect(second.map((i) => i.id).sort()).toEqual(first.map((i) => i.id).sort());
  });

  it("forceRegenerate always writes and returns a fresh pair, replacing what 'latest' resolves to", async () => {
    const { match } = await makeMatchWithTranscripts("clerk_gen_force_a", "clerk_gen_force_b");

    const first = await getOrGenerateIdeas(db, match.id, match.userAId);
    const regenerated = await getOrGenerateIdeas(db, match.id, match.userAId, { forceRegenerate: true });

    expect(regenerated).toHaveLength(2);
    expect(regenerated.map((i) => i.id).sort()).not.toEqual(first.map((i) => i.id).sort());

    // A plain (non-forced) call afterward now reads the regenerated pair.
    const cachedAfterRegen = await getOrGenerateIdeas(db, match.id, match.userAId);
    expect(cachedAfterRegen.map((i) => i.id).sort()).toEqual(regenerated.map((i) => i.id).sort());
  });

  it("converges on one stable cached pair even after two concurrent first-ever calls race", async () => {
    // Regression coverage for the race a Next.js Link prefetch racing an
    // immediate real navigation to the same calendar page can trigger
    // (get-or-generate-ideas.ts's own header comment on the pre-insert
    // recheck: that check narrows the race but isn't a hard atomicity
    // guarantee — a truly simultaneous pair of calls, as forced here with
    // Promise.all, can still both write). What the comment *does* promise,
    // and what this asserts: regardless of how many batches the race
    // itself produced, every read from this point on is stable and every
    // caller converges on the exact same pair.
    const { match } = await makeMatchWithTranscripts("clerk_gen_race_a", "clerk_gen_race_b");

    await Promise.all([
      getOrGenerateIdeas(db, match.id, match.userAId),
      getOrGenerateIdeas(db, match.id, match.userBId),
    ]);

    const a = await getOrGenerateIdeas(db, match.id, match.userAId);
    const b = await getOrGenerateIdeas(db, match.id, match.userBId);
    expect(a).toHaveLength(2);
    expect(b.map((i) => i.id).sort()).toEqual(a.map((i) => i.id).sort());
  });

  it("either matched user may trigger generation", async () => {
    const { match, b } = await makeMatchWithTranscripts("clerk_gen_otherside_a", "clerk_gen_otherside_b");
    const ideas = await getOrGenerateIdeas(db, match.id, b);
    expect(ideas).toHaveLength(2);
  });

  it("rejects a viewer who isn't a participant in the match", async () => {
    const { match } = await makeMatchWithTranscripts("clerk_gen_stranger_a", "clerk_gen_stranger_b");
    const stranger = await ensureUserForClerkId(db, "clerk_gen_stranger_c");

    await expect(getOrGenerateIdeas(db, match.id, stranger.id)).rejects.toBeInstanceOf(DateProposalMatchAccessError);
  });

  it("rejects generation on an Escaped (blocked) match", async () => {
    const { match } = await makeMatchWithTranscripts("clerk_gen_blocked_a", "clerk_gen_blocked_b");
    await blockMatch(db, { userAId: match.userAId, userBId: match.userBId });

    await expect(getOrGenerateIdeas(db, match.id, match.userAId)).rejects.toBeInstanceOf(
      DateProposalMatchNotActiveError,
    );
  });

  it("still generates when neither user has captured a location yet (sharedGeohashCell: null)", async () => {
    const { match } = await makeMatchWithTranscripts("clerk_gen_nolocation_a", "clerk_gen_nolocation_b");
    const ideas = await getOrGenerateIdeas(db, match.id, match.userAId);
    expect(ideas).toHaveLength(2);
  });

  it("generates when both users have a captured (possibly differing) geohash cell", async () => {
    const { match, a, b } = await makeMatchWithTranscripts("clerk_gen_location_a", "clerk_gen_location_b");
    await updateUserGeohash(db, a, "gcpvj");
    await updateUserGeohash(db, b, "gcpvh");

    const ideas = await getOrGenerateIdeas(db, match.id, a);
    expect(ideas).toHaveLength(2);
  });

  it("the dev-mock fixture itself matches what the query layer returns (sanity check on the fixture, not just shape)", async () => {
    const { match } = await makeMatchWithTranscripts("clerk_gen_fixture_a", "clerk_gen_fixture_b");
    const ideas = await getOrGenerateIdeas(db, match.id, match.userAId);
    expect(ideas.map((i) => i.ideaText).sort()).toEqual(DEV_MOCK_DATE_IDEAS.map((i) => i.ideaText).sort());
  });
});
