// Schema-level verification for every table in ENGINEERING_SPEC.md §2.
//
// No live Neon credentials exist yet (ROADMAP.md → Needs from Sampo), so
// this suite runs the *actual generated migration* (packages/db/drizzle)
// against @electric-sql/pglite — a real embedded Postgres, not a mock —
// per the task's "local/dev Postgres" acceptance bullet in ROADMAP M1.
// It proves: the migration applies cleanly, every FK/CHECK/UNIQUE/enum
// constraint behaves as designed, and ON DELETE behavior (cascade vs.
// restrict) is what the schema comments claim.
//
// Assertion style note: drizzle-orm wraps every driver error in a generic
// "Failed query: ..." message, so matching `.message` can't distinguish
// *which* constraint fired. The real Postgres error (name, SQLSTATE code)
// lives on `.cause` — `expectConstraintViolation`/`expectForeignKeyViolation`/
// `expectInvalidEnumValue` below assert on that instead.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { eq, sql } from "drizzle-orm";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "./index";

const migrationsFolder = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../drizzle",
);

const NIL_UUID = "00000000-0000-0000-0000-000000000000";

interface PgDriverError {
  cause?: {
    constraint?: string;
    code?: string;
    message?: string;
  };
}

async function catchError(promise: Promise<unknown>): Promise<PgDriverError | undefined> {
  return promise.then(
    () => undefined,
    (err: unknown) => err as PgDriverError,
  );
}

/** Asserts the promise rejects because the named CHECK/UNIQUE constraint fired. */
async function expectConstraintViolation(promise: Promise<unknown>, constraintName: string) {
  const err = await catchError(promise);
  expect(err, `expected a rejection violating constraint "${constraintName}", but the query succeeded`).toBeDefined();
  expect(err?.cause?.constraint).toBe(constraintName);
}

/** Asserts the promise rejects with a Postgres foreign_key_violation (23503). */
async function expectForeignKeyViolation(promise: Promise<unknown>) {
  const err = await catchError(promise);
  expect(err, "expected a foreign key violation, but the query succeeded").toBeDefined();
  expect(err?.cause?.code).toBe("23503");
}

/** Asserts the promise rejects with a Postgres invalid_text_representation (22P02) — an out-of-enum value. */
async function expectInvalidEnumValue(promise: Promise<unknown>) {
  const err = await catchError(promise);
  expect(err, "expected an invalid enum value error, but the query succeeded").toBeDefined();
  expect(err?.cause?.code).toBe("22P02");
}

describe("packages/db schema", () => {
  let client: PGlite;
  let db: PgliteDatabase<typeof schema>;
  let clerkCounter = 0;
  let promptCounter = 0;

  beforeAll(async () => {
    client = new PGlite();
    db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder });
  });

  afterAll(async () => {
    await client.close();
  });

  function nextClerkId(label: string) {
    clerkCounter += 1;
    return `clerk_${label}_${clerkCounter}`;
  }

  async function makeUser(label: string) {
    const [user] = await db
      .insert(schema.users)
      .values({ clerkId: nextClerkId(label) })
      .returning();
    return user;
  }

  async function makePrompt(tier: number) {
    promptCounter += 1;
    // Distinct text per call — prompts now carries a UNIQUE(tier, text)
    // index (schema/prompts.ts, added for ROADMAP.md M4's seed step), so
    // reusing the same text for the same tier across tests would collide.
    const [prompt] = await db
      .insert(schema.prompts)
      .values({ tier, text: `prompt tier ${tier} #${promptCounter}` })
      .returning();
    return prompt;
  }

  async function makeClip(overrides: {
    userId: string;
    tier: number;
    promptId?: string;
    customPromptText?: string;
  }) {
    const [clip] = await db
      .insert(schema.clips)
      .values({
        userId: overrides.userId,
        tier: overrides.tier,
        durationSeconds: 15,
        storageUrl: "https://blob.example/clip",
        promptId: overrides.promptId,
        customPromptText: overrides.customPromptText,
      })
      .returning();
    return clip;
  }

  async function makeMatch(userAId: string, userBId: string) {
    const [match] = await db
      .insert(schema.matches)
      .values({ userAId, userBId })
      .returning();
    return match;
  }

  it("applies the generated migration cleanly and creates every ENGINEERING_SPEC.md §2 table", async () => {
    const { rows } = await db.execute<{ table_name: string }>(
      sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
    );
    const tableNames = rows.map((r) => r.table_name);
    expect(tableNames).toEqual(
      [
        "calendar_slots",
        "chat_messages",
        "chat_windows",
        "clip_views",
        "clips",
        "date_ideas_generated",
        "date_proposals",
        "feed_decisions",
        "matches",
        "moderation_flags",
        "prompts",
        "reports",
        "rewatch_sessions",
        "users",
        "verification_records",
      ].sort(),
    );
  });

  describe("users", () => {
    it("defaults verification_status to pending and radius_km to 25, and never persists raw coordinates", async () => {
      const user = await makeUser("defaults");
      expect(user.verificationStatus).toBe("pending");
      expect(user.radiusKm).toBe(25);
      expect(user.geohash5).toBeNull();
      // No lat/lon-shaped columns exist on the table at all (§6: only a
      // length-5 geohash is ever stored).
      expect(Object.keys(user)).not.toContain("latitude");
      expect(Object.keys(user)).not.toContain("longitude");
    });

    it("rejects a duplicate clerk_id", async () => {
      const clerkId = nextClerkId("dupe");
      await db.insert(schema.users).values({ clerkId });
      await expectConstraintViolation(
        db.insert(schema.users).values({ clerkId }),
        "users_clerk_id_idx",
      );
    });

    it("rejects a non-positive radius_km", async () => {
      await expectConstraintViolation(
        db.insert(schema.users).values({ clerkId: nextClerkId("radius"), radiusKm: 0 }),
        "users_radius_km_positive",
      );
    });
  });

  describe("verification_records", () => {
    it("stores only the enum result + confidence, never selfie bytes, and FKs to a real user", async () => {
      const user = await makeUser("verify");
      const [record] = await db
        .insert(schema.verificationRecords)
        .values({
          userId: user.id,
          livenessResult: "pass",
          ageEstimateResult: "pending",
          confidence: 0.92,
        })
        .returning();
      expect(record.livenessResult).toBe("pass");
      expect(record.ageEstimateResult).toBe("pending");
      // The row shape itself is the proof: no selfie/blob column exists.
      expect(Object.keys(record).sort()).toEqual(
        ["ageEstimateResult", "checkedAt", "confidence", "id", "livenessResult", "userId"].sort(),
      );
    });

    it("rejects a result value outside the pass/fail/pending enum", async () => {
      const user = await makeUser("verify-bad-enum");
      await expectInvalidEnumValue(
        db.execute(
          sql`INSERT INTO verification_records (user_id, liveness_result, age_estimate_result, confidence) VALUES (${user.id}, 'bogus', 'pass', 0.5)`,
        ),
      );
    });

    it("rejects a record for a nonexistent user", async () => {
      await expectForeignKeyViolation(
        db.insert(schema.verificationRecords).values({
          userId: NIL_UUID,
          livenessResult: "pass",
          ageEstimateResult: "pass",
          confidence: 0.9,
        }),
      );
    });
  });

  describe("prompts", () => {
    it("accepts tiers 1-4", async () => {
      for (const tier of [1, 2, 3, 4]) {
        const prompt = await makePrompt(tier);
        expect(prompt.tier).toBe(tier);
        expect(prompt.isActive).toBe(true);
      }
    });

    it("rejects a tier outside 1-4", async () => {
      await expectConstraintViolation(
        db.insert(schema.prompts).values({ tier: 0, text: "bad" }),
        "prompts_tier_range",
      );
      await expectConstraintViolation(
        db.insert(schema.prompts).values({ tier: 5, text: "bad" }),
        "prompts_tier_range",
      );
    });
  });

  describe("clips", () => {
    it("requires exactly one of prompt_id / custom_prompt_text", async () => {
      const user = await makeUser("clip-xor");
      const prompt = await makePrompt(1);

      await expectConstraintViolation(
        db.insert(schema.clips).values({
          userId: user.id,
          tier: 1,
          durationSeconds: 15,
          storageUrl: "https://blob.example/a",
        }),
        "clips_prompt_source_xor",
      );

      await expectConstraintViolation(
        db.insert(schema.clips).values({
          userId: user.id,
          tier: 1,
          durationSeconds: 15,
          storageUrl: "https://blob.example/b",
          promptId: prompt.id,
          customPromptText: "both set",
        }),
        "clips_prompt_source_xor",
      );

      const clip = await makeClip({ userId: user.id, tier: 1, promptId: prompt.id });
      expect(clip.moderationStatus).toBe("processing");
    });

    it("enforces one clip per (user, tier)", async () => {
      const user = await makeUser("clip-unique-tier");
      await makeClip({ userId: user.id, tier: 1, customPromptText: "first" });
      await expectConstraintViolation(
        makeClip({ userId: user.id, tier: 1, customPromptText: "second" }),
        "clips_user_tier_idx",
      );
    });

    it("rejects a non-positive duration and an out-of-range tier", async () => {
      const user = await makeUser("clip-bad-values");
      await expectConstraintViolation(
        db.insert(schema.clips).values({
          userId: user.id,
          tier: 1,
          durationSeconds: 0,
          storageUrl: "https://blob.example/c",
          customPromptText: "x",
        }),
        "clips_duration_positive",
      );
      await expectConstraintViolation(
        db.insert(schema.clips).values({
          userId: user.id,
          tier: 9,
          durationSeconds: 15,
          storageUrl: "https://blob.example/d",
          customPromptText: "x",
        }),
        "clips_tier_range",
      );
    });

    it("rejects a clip for a nonexistent user", async () => {
      await expectForeignKeyViolation(
        db.insert(schema.clips).values({
          userId: NIL_UUID,
          tier: 1,
          durationSeconds: 15,
          storageUrl: "https://blob.example/e",
          customPromptText: "x",
        }),
      );
    });

    it("blocks deleting a prompt still referenced by a clip (RESTRICT, not SET NULL)", async () => {
      const user = await makeUser("clip-prompt-restrict");
      const prompt = await makePrompt(2);
      await makeClip({ userId: user.id, tier: 2, promptId: prompt.id });
      await expectForeignKeyViolation(
        db.delete(schema.prompts).where(eq(schema.prompts.id, prompt.id)),
      );
    });

    it("cascades: deleting a clip removes its clip_views and moderation_flags", async () => {
      const viewer = await makeUser("cascade-viewer");
      const owner = await makeUser("cascade-owner");
      const clip = await makeClip({ userId: owner.id, tier: 1, customPromptText: "x" });

      await db.insert(schema.clipViews).values({
        viewerId: viewer.id,
        profileUserId: owner.id,
        clipId: clip.id,
      });
      await db.insert(schema.moderationFlags).values({
        clipId: clip.id,
        flagType: "sexual",
        confidence: 0.8,
      });

      await db.delete(schema.clips).where(eq(schema.clips.id, clip.id));

      const views = await db
        .select()
        .from(schema.clipViews)
        .where(eq(schema.clipViews.clipId, clip.id));
      const flags = await db
        .select()
        .from(schema.moderationFlags)
        .where(eq(schema.moderationFlags.clipId, clip.id));
      expect(views).toHaveLength(0);
      expect(flags).toHaveLength(0);
    });
  });

  describe("clip_views", () => {
    it("enforces one view row per (viewer, clip)", async () => {
      const viewer = await makeUser("view-unique-viewer");
      const owner = await makeUser("view-unique-owner");
      const clip = await makeClip({ userId: owner.id, tier: 1, customPromptText: "x" });

      await db.insert(schema.clipViews).values({
        viewerId: viewer.id,
        profileUserId: owner.id,
        clipId: clip.id,
      });
      await expectConstraintViolation(
        db.insert(schema.clipViews).values({
          viewerId: viewer.id,
          profileUserId: owner.id,
          clipId: clip.id,
        }),
        "clip_views_viewer_clip_idx",
      );
    });

    it("defaults completed to false", async () => {
      const viewer = await makeUser("view-default-viewer");
      const owner = await makeUser("view-default-owner");
      const clip = await makeClip({ userId: owner.id, tier: 2, customPromptText: "x" });
      const [view] = await db
        .insert(schema.clipViews)
        .values({ viewerId: viewer.id, profileUserId: owner.id, clipId: clip.id })
        .returning();
      expect(view.completed).toBe(false);
      expect(view.completedAt).toBeNull();
    });
  });

  describe("feed_decisions", () => {
    it("allows repeated denied rows for the same (viewer, profile) pair over time", async () => {
      const viewer = await makeUser("feed-viewer");
      const profile = await makeUser("feed-profile");
      const later = new Date(Date.now() + 48 * 60 * 60 * 1000);

      await db.insert(schema.feedDecisions).values({
        viewerId: viewer.id,
        profileUserId: profile.id,
        decision: "denied",
        eligibleAgainAt: later,
      });
      // Same pair, denied again later — no uniqueness constraint blocks this.
      await expect(
        db.insert(schema.feedDecisions).values({
          viewerId: viewer.id,
          profileUserId: profile.id,
          decision: "denied",
          eligibleAgainAt: later,
        }),
      ).resolves.toBeDefined();
    });

    it("rejects a decision value outside denied/matched", async () => {
      const viewer = await makeUser("feed-bad-viewer");
      const profile = await makeUser("feed-bad-profile");
      await expectInvalidEnumValue(
        db.execute(
          sql`INSERT INTO feed_decisions (viewer_id, profile_user_id, decision) VALUES (${viewer.id}, ${profile.id}, 'liked')`,
        ),
      );
    });
  });

  describe("matches", () => {
    it("rejects a self-match", async () => {
      const user = await makeUser("self-match");
      await expectConstraintViolation(
        db.insert(schema.matches).values({ userAId: user.id, userBId: user.id }),
        "matches_no_self_match",
      );
    });

    it("rejects a duplicate (user_a, user_b) pair and defaults status to active", async () => {
      const a = await makeUser("match-a");
      const b = await makeUser("match-b");
      const match = await makeMatch(a.id, b.id);
      expect(match.status).toBe("active");
      await expectConstraintViolation(makeMatch(a.id, b.id), "matches_user_pair_idx");
    });

    it("rejects a status value outside active/blocked", async () => {
      const a = await makeUser("match-bad-status-a");
      const b = await makeUser("match-bad-status-b");
      await expectInvalidEnumValue(
        db.execute(
          sql`INSERT INTO matches (user_a_id, user_b_id, status) VALUES (${a.id}, ${b.id}, 'pending')`,
        ),
      );
    });
  });

  describe("rewatch_sessions", () => {
    it("links to a real match and viewer", async () => {
      const a = await makeUser("rewatch-a");
      const b = await makeUser("rewatch-b");
      const match = await makeMatch(a.id, b.id);
      const now = new Date();
      const [session] = await db
        .insert(schema.rewatchSessions)
        .values({
          matchId: match.id,
          viewerId: a.id,
          openedAt: now,
          expiresAt: new Date(now.getTime() + 15 * 60 * 1000),
        })
        .returning();
      expect(session.matchId).toBe(match.id);
    });

    it("rejects a session for a nonexistent match", async () => {
      const a = await makeUser("rewatch-orphan");
      const now = new Date();
      await expectForeignKeyViolation(
        db.insert(schema.rewatchSessions).values({
          matchId: NIL_UUID,
          viewerId: a.id,
          openedAt: now,
          expiresAt: new Date(now.getTime() + 900_000),
        }),
      );
    });
  });

  describe("calendar_slots", () => {
    it("rejects an end_at at or before start_at", async () => {
      const user = await makeUser("calendar-bad");
      const start = new Date();
      await expectConstraintViolation(
        db.insert(schema.calendarSlots).values({
          userId: user.id,
          startAt: start,
          endAt: start,
          status: "busy",
        }),
        "calendar_slots_end_after_start",
      );
    });

    it("accepts a valid busy/available slot", async () => {
      const user = await makeUser("calendar-good");
      const start = new Date();
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      const [slot] = await db
        .insert(schema.calendarSlots)
        .values({ userId: user.id, startAt: start, endAt: end, status: "available" })
        .returning();
      expect(slot.status).toBe("available");
    });
  });

  describe("date_ideas_generated + date_proposals", () => {
    it("caches ideas against a match", async () => {
      const a = await makeUser("idea-a");
      const b = await makeUser("idea-b");
      const match = await makeMatch(a.id, b.id);
      const [idea1, idea2] = await db
        .insert(schema.dateIdeasGenerated)
        .values([
          { matchId: match.id, ideaText: "Bouldering", rationale: "both mentioned climbing" },
          { matchId: match.id, ideaText: "Pottery class", rationale: "novel + hands-on" },
        ])
        .returning();
      expect(idea1.matchId).toBe(match.id);
      expect(idea2.ideaText).toBe("Pottery class");
    });

    it("requires generated_idea_id exactly when idea_source = 'generated'", async () => {
      const a = await makeUser("proposal-a");
      const b = await makeUser("proposal-b");
      const match = await makeMatch(a.id, b.id);
      const [idea] = await db
        .insert(schema.dateIdeasGenerated)
        .values({ matchId: match.id, ideaText: "Kayaking", rationale: "r" })
        .returning();

      const start = new Date();
      const end = new Date(start.getTime() + 90 * 60 * 1000);

      await expectConstraintViolation(
        db.insert(schema.dateProposals).values({
          matchId: match.id,
          proposedByUserId: a.id,
          ideaSource: "generated",
          ideaText: idea.ideaText,
          slotStartAt: start,
          slotEndAt: end,
        }),
        "date_proposals_generated_idea_xor",
      );

      await expectConstraintViolation(
        db.insert(schema.dateProposals).values({
          matchId: match.id,
          proposedByUserId: a.id,
          ideaSource: "custom",
          ideaText: "A custom idea",
          generatedIdeaId: idea.id,
          slotStartAt: start,
          slotEndAt: end,
        }),
        "date_proposals_generated_idea_xor",
      );

      const [proposal] = await db
        .insert(schema.dateProposals)
        .values({
          matchId: match.id,
          proposedByUserId: a.id,
          ideaSource: "generated",
          ideaText: idea.ideaText,
          generatedIdeaId: idea.id,
          slotStartAt: start,
          slotEndAt: end,
        })
        .returning();
      expect(proposal.status).toBe("pending");
    });

    it("rejects a slot_end_at at or before slot_start_at", async () => {
      const a = await makeUser("proposal-slot-a");
      const b = await makeUser("proposal-slot-b");
      const match = await makeMatch(a.id, b.id);
      const start = new Date();
      await expectConstraintViolation(
        db.insert(schema.dateProposals).values({
          matchId: match.id,
          proposedByUserId: a.id,
          ideaSource: "custom",
          ideaText: "A custom idea",
          slotStartAt: start,
          slotEndAt: start,
        }),
        "date_proposals_slot_end_after_start",
      );
    });
  });

  describe("chat_windows + chat_messages", () => {
    async function makeLockedProposal(matchId: string, byUserId: string) {
      const start = new Date();
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      const [proposal] = await db
        .insert(schema.dateProposals)
        .values({
          matchId,
          proposedByUserId: byUserId,
          ideaSource: "custom",
          ideaText: "Coffee",
          slotStartAt: start,
          slotEndAt: end,
          status: "accepted",
        })
        .returning();
      return proposal;
    }

    it("rejects a closes_at at or before opens_at", async () => {
      const a = await makeUser("chatwin-bad-a");
      const b = await makeUser("chatwin-bad-b");
      const match = await makeMatch(a.id, b.id);
      const proposal = await makeLockedProposal(match.id, a.id);
      const opens = new Date();
      await expectConstraintViolation(
        db.insert(schema.chatWindows).values({
          matchId: match.id,
          dateProposalId: proposal.id,
          opensAt: opens,
          closesAt: opens,
        }),
        "chat_windows_closes_after_opens",
      );
    });

    it("enforces one window per locked proposal", async () => {
      const a = await makeUser("chatwin-unique-a");
      const b = await makeUser("chatwin-unique-b");
      const match = await makeMatch(a.id, b.id);
      const proposal = await makeLockedProposal(match.id, a.id);
      const opens = new Date();
      const closes = new Date(opens.getTime() + 4 * 60 * 60 * 1000);

      await db.insert(schema.chatWindows).values({
        matchId: match.id,
        dateProposalId: proposal.id,
        opensAt: opens,
        closesAt: closes,
      });
      await expectConstraintViolation(
        db.insert(schema.chatWindows).values({
          matchId: match.id,
          dateProposalId: proposal.id,
          opensAt: opens,
          closesAt: closes,
        }),
        "chat_windows_date_proposal_idx",
      );
    });

    it("cascades: deleting a chat_window removes its chat_messages", async () => {
      const a = await makeUser("chatmsg-cascade-a");
      const b = await makeUser("chatmsg-cascade-b");
      const match = await makeMatch(a.id, b.id);
      const proposal = await makeLockedProposal(match.id, a.id);
      const opens = new Date();
      const closes = new Date(opens.getTime() + 4 * 60 * 60 * 1000);
      const [window_] = await db
        .insert(schema.chatWindows)
        .values({ matchId: match.id, dateProposalId: proposal.id, opensAt: opens, closesAt: closes })
        .returning();
      await db.insert(schema.chatMessages).values({
        chatWindowId: window_.id,
        senderId: a.id,
        body: "running late!",
      });

      await db.delete(schema.chatWindows).where(eq(schema.chatWindows.id, window_.id));

      const messages = await db
        .select()
        .from(schema.chatMessages)
        .where(eq(schema.chatMessages.chatWindowId, window_.id));
      expect(messages).toHaveLength(0);
    });
  });

  describe("reports", () => {
    it("defaults status to open and requires a match", async () => {
      const reporter = await makeUser("report-reporter");
      const reported = await makeUser("report-reported");
      const match = await makeMatch(reporter.id, reported.id);
      const [report] = await db
        .insert(schema.reports)
        .values({
          reporterId: reporter.id,
          reportedUserId: reported.id,
          matchId: match.id,
          reason: "showed up with someone else",
        })
        .returning();
      expect(report.status).toBe("open");
    });
  });

  describe("moderation_flags", () => {
    it("requires exactly one of clip_id / chat_message_id", async () => {
      await expectConstraintViolation(
        db.insert(schema.moderationFlags).values({ flagType: "sexual", confidence: 0.7 }),
        "moderation_flags_target_xor",
      );

      const owner = await makeUser("modflag-owner");
      const clip = await makeClip({ userId: owner.id, tier: 1, customPromptText: "x" });

      const a = await makeUser("modflag-a");
      const b = await makeUser("modflag-b");
      const match = await makeMatch(a.id, b.id);
      const start = new Date();
      const [proposal] = await db
        .insert(schema.dateProposals)
        .values({
          matchId: match.id,
          proposedByUserId: a.id,
          ideaSource: "custom",
          ideaText: "Coffee",
          slotStartAt: start,
          slotEndAt: new Date(start.getTime() + 3_600_000),
          status: "accepted",
        })
        .returning();
      const [window_] = await db
        .insert(schema.chatWindows)
        .values({
          matchId: match.id,
          dateProposalId: proposal.id,
          opensAt: start,
          closesAt: new Date(start.getTime() + 4 * 3_600_000),
        })
        .returning();
      const [message] = await db
        .insert(schema.chatMessages)
        .values({ chatWindowId: window_.id, senderId: a.id, body: "hey" })
        .returning();

      await expectConstraintViolation(
        db.insert(schema.moderationFlags).values({
          clipId: clip.id,
          chatMessageId: message.id,
          flagType: "sexual",
          confidence: 0.7,
        }),
        "moderation_flags_target_xor",
      );

      const [clipFlag] = await db
        .insert(schema.moderationFlags)
        .values({ clipId: clip.id, flagType: "sexual", confidence: 0.7 })
        .returning();
      expect(clipFlag.reviewed).toBe(false);
      expect(clipFlag.actionTaken).toBeNull();

      await expect(
        db.insert(schema.moderationFlags).values({
          chatMessageId: message.id,
          flagType: "harassment",
          confidence: 0.6,
        }),
      ).resolves.toBeDefined();
    });

    it("rejects an action_taken value outside cleared/removed", async () => {
      const owner = await makeUser("modflag-bad-action-owner");
      const clip = await makeClip({ userId: owner.id, tier: 1, customPromptText: "x" });
      await expectInvalidEnumValue(
        db.execute(
          sql`INSERT INTO moderation_flags (clip_id, flag_type, confidence, action_taken) VALUES (${clip.id}, 'violence', 0.5, 'ignored')`,
        ),
      );
    });
  });
});
