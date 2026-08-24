// ROADMAP.md M3: "writes verification_records" + the users.verification_status
// gate transition. Same PGlite-against-the-real-migration pattern as
// users.test.ts / schema.test.ts — no live Neon database exists yet.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "../schema";
import { ensureUserForClerkId } from "./users";
import { recordVerificationCheck } from "./verification";

const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), "../../drizzle");

describe("recordVerificationCheck", () => {
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

  it("writes a verification_records row and flips verification_status to passed", async () => {
    const user = await ensureUserForClerkId(db, "clerk_verify_pass");
    expect(user.verificationStatus).toBe("pending");

    const { record, user: updated } = await recordVerificationCheck(
      db,
      user.id,
      { livenessResult: "pass", ageEstimateResult: "pass", confidence: 0.98 },
      "passed",
    );

    expect(record.userId).toBe(user.id);
    expect(record.livenessResult).toBe("pass");
    expect(record.ageEstimateResult).toBe("pass");
    expect(record.confidence).toBeCloseTo(0.98);
    expect(updated.verificationStatus).toBe("passed");

    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, user.id));
    expect(row!.verificationStatus).toBe("passed");
  });

  it("still writes the record on a failing check, and sets verification_status to failed (not left pending)", async () => {
    const user = await ensureUserForClerkId(db, "clerk_verify_fail");

    const { record, user: updated } = await recordVerificationCheck(
      db,
      user.id,
      { livenessResult: "fail", ageEstimateResult: "pass", confidence: 0.4 },
      "failed",
    );

    expect(record.livenessResult).toBe("fail");
    expect(updated.verificationStatus).toBe("failed");
  });

  it("keeps a full audit trail: a retry after a failure adds a second record, not a replacement", async () => {
    const user = await ensureUserForClerkId(db, "clerk_verify_retry");

    await recordVerificationCheck(
      db,
      user.id,
      { livenessResult: "fail", ageEstimateResult: "pass", confidence: 0.3 },
      "failed",
    );
    await recordVerificationCheck(
      db,
      user.id,
      { livenessResult: "pass", ageEstimateResult: "pass", confidence: 0.95 },
      "passed",
    );

    const records = await db
      .select()
      .from(schema.verificationRecords)
      .where(eq(schema.verificationRecords.userId, user.id));
    expect(records).toHaveLength(2);

    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, user.id));
    expect(row!.verificationStatus).toBe("passed");
  });

  it("rejects an unknown userId (foreign key on verification_records.user_id)", async () => {
    const nilUuid = "00000000-0000-0000-0000-000000000000";
    await expect(
      recordVerificationCheck(
        db,
        nilUuid,
        { livenessResult: "pass", ageEstimateResult: "pass", confidence: 0.9 },
        "passed",
      ),
    ).rejects.toBeTruthy();
  });
});
