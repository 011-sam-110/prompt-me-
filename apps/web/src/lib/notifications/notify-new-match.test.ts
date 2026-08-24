// ROADMAP.md M13: "Email fires for: new match." "Notification sending is
// mockable in tests (no real email sent in the test suite)." Asserts
// against the real composition point (checkAndCreateMatchIfMutual, not
// just notifyNewMatch in isolation) via @prompt-me/core's
// DevMockNotificationProvider — the same provider getNotificationProvider()
// resolves to for the whole suite, since no test ever sets
// RESEND_API_KEY/RESEND_FROM_EMAIL.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@prompt-me/db/schema";
import { ensurePromptsSeeded, ensureUserForClerkId, insertClip, recordClipViewPosition } from "@prompt-me/db";
import { clearDevMockSentNotifications, getDevMockSentNotifications } from "@prompt-me/core";
import { checkAndCreateMatchIfMutual } from "../matches/check-and-create-match";

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../packages/db/drizzle");

describe("new-match notification (via checkAndCreateMatchIfMutual)", () => {
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

  async function makeMutualCompletion(clerkIdA: string, clerkIdB: string) {
    const userA = await ensureUserForClerkId(db, clerkIdA);
    const userB = await ensureUserForClerkId(db, clerkIdB);
    const clipA = await insertClip(db, {
      userId: userA.id,
      tier: 1,
      durationSeconds: 15,
      storageUrl: `dev-blob://notify/${clerkIdA}.wav`,
      customPromptText: "x",
    });
    const clipB = await insertClip(db, {
      userId: userB.id,
      tier: 1,
      durationSeconds: 15,
      storageUrl: `dev-blob://notify/${clerkIdB}.wav`,
      customPromptText: "y",
    });
    await recordClipViewPosition(db, {
      viewerId: userB.id,
      profileUserId: userA.id,
      clipId: clipA.id,
      reachedEnd: true,
    });
    const aViewsB = await recordClipViewPosition(db, {
      viewerId: userA.id,
      profileUserId: userB.id,
      clipId: clipB.id,
      reachedEnd: true,
    });
    return { userA, userB, aViewsB };
  }

  it("calls the notification adapter twice — once per participant — with type=new_match and each side's own recipient", async () => {
    const { userA, userB, aViewsB } = await makeMutualCompletion("clerk_notify_match_a", "clerk_notify_match_b");

    const match = await checkAndCreateMatchIfMutual(db, aViewsB);
    expect(match).not.toBeNull();

    const sent = getDevMockSentNotifications();
    const matchEvents = sent.filter((s) => s.event.type === "new_match");
    expect(matchEvents).toHaveLength(2);

    const recipients = matchEvents.map((s) => s.event.recipientEmail).sort();
    const expected = [`${userA.clerkId}@dev.prompt-me.invalid`, `${userB.clerkId}@dev.prompt-me.invalid`].sort();
    expect(recipients).toEqual(expected);

    for (const event of matchEvents) {
      expect(event.event).toMatchObject({ type: "new_match", matchId: match!.id });
    }
  });

  it("never re-sends on a repeat call for a pair that already matched", async () => {
    const { aViewsB } = await makeMutualCompletion("clerk_notify_match_repeat_a", "clerk_notify_match_repeat_b");

    const first = await checkAndCreateMatchIfMutual(db, aViewsB);
    expect(first).not.toBeNull();
    expect(getDevMockSentNotifications().filter((s) => s.event.type === "new_match")).toHaveLength(2);

    clearDevMockSentNotifications();

    // Same already-complete view reported again — production hits this
    // exact path on every later clip_views write for an already-matched
    // pair (check-and-create-match.ts's own header comment).
    const second = await checkAndCreateMatchIfMutual(db, aViewsB);
    expect(second!.id).toBe(first!.id);
    expect(getDevMockSentNotifications().filter((s) => s.event.type === "new_match")).toHaveLength(0);
  });

  it("sends nothing at all when completion is only one-directional", async () => {
    const userA = await ensureUserForClerkId(db, "clerk_notify_match_onedir_a");
    const userB = await ensureUserForClerkId(db, "clerk_notify_match_onedir_b");
    const clipA = await insertClip(db, {
      userId: userA.id,
      tier: 1,
      durationSeconds: 15,
      storageUrl: "dev-blob://notify/onedir-a.wav",
      customPromptText: "x",
    });

    const clipView = await recordClipViewPosition(db, {
      viewerId: userB.id,
      profileUserId: userA.id,
      clipId: clipA.id,
      reachedEnd: true,
    });

    const match = await checkAndCreateMatchIfMutual(db, clipView);
    expect(match).toBeNull();
    expect(getDevMockSentNotifications()).toHaveLength(0);
  });
});
