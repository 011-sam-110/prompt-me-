// ROADMAP.md M2 acceptance: "Sign-up/sign-in via Clerk creates a `users`
// row" + "Unit tests cover the account-creation -> onboarding-state
// transition." Runs the real generated migration against @electric-sql/
// pglite, same pattern as schema/schema.test.ts, since no live Neon
// database exists yet.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { onboardingStateForUser } from "@prompt-me/core";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "../schema";
import { ensureUserForClerkId } from "./users";

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../drizzle");

describe("ensureUserForClerkId", () => {
  let client: PGlite;
  let db: PgliteDatabase<typeof schema>;

  beforeAll(async () => {
    client = new PGlite();
    db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder });
  });

  afterAll(async () => {
    await client.close();
  });

  it("creates a users row on first sign-in, defaulting to pending / needs_verification", async () => {
    const user = await ensureUserForClerkId(db, "clerk_new_account");
    expect(user.clerkId).toBe("clerk_new_account");
    expect(user.verificationStatus).toBe("pending");
    expect(onboardingStateForUser(user)).toBe("needs_verification");
  });

  it("is exactly-once: a second call for the same clerkId returns the same row, no duplicate", async () => {
    const first = await ensureUserForClerkId(db, "clerk_repeat_signin");
    const second = await ensureUserForClerkId(db, "clerk_repeat_signin");
    expect(second.id).toBe(first.id);

    const rows = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.clerkId, "clerk_repeat_signin"));
    expect(rows).toHaveLength(1);
  });

  it("is exactly-once even under concurrent calls (webhook + server action racing for the same account)", async () => {
    const clerkId = "clerk_concurrent_signin";
    const [a, b, c] = await Promise.all([
      ensureUserForClerkId(db, clerkId),
      ensureUserForClerkId(db, clerkId),
      ensureUserForClerkId(db, clerkId),
    ]);
    expect(a.id).toBe(b.id);
    expect(b.id).toBe(c.id);

    const rows = await db.select().from(schema.users).where(eq(schema.users.clerkId, clerkId));
    expect(rows).toHaveLength(1);
  });

  it("keeps distinct accounts separate", async () => {
    const userA = await ensureUserForClerkId(db, "clerk_account_a");
    const userB = await ensureUserForClerkId(db, "clerk_account_b");
    expect(userA.id).not.toBe(userB.id);
  });

  it("account-creation -> onboarding-state transition: feed stays blocked until verification_status flips to passed", async () => {
    const created = await ensureUserForClerkId(db, "clerk_transition_account");
    expect(onboardingStateForUser(created)).toBe("needs_verification");

    // Simulates M3 completing a passing verification check.
    await db
      .update(schema.users)
      .set({ verificationStatus: "passed" })
      .where(eq(schema.users.id, created.id));

    const [updated] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, created.id));
    expect(onboardingStateForUser(updated!)).toBe("active");

    // Signing back in after verification must not create a second row,
    // nor reset the account back to pending.
    const resigned = await ensureUserForClerkId(db, "clerk_transition_account");
    expect(resigned.id).toBe(created.id);
    expect(onboardingStateForUser(resigned)).toBe("active");

    const rows = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.clerkId, "clerk_transition_account"));
    expect(rows).toHaveLength(1);
  });
});
