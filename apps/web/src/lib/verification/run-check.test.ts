// ROADMAP.md M3 acceptance: "writes verification_records, and does not
// persist the raw frame — a test asserts no selfie blob exists in storage
// after a check." Same PGlite-against-the-real-migration pattern as
// apps/web/src/lib/auth/onboarding.test.ts.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEV_MOCK_VERIFICATION_CONFIDENCE } from "@prompt-me/core";
import { ensureUserForClerkId } from "@prompt-me/db";
import * as schema from "@prompt-me/db/schema";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { runVerificationCheck } from "./run-check";

const migrationsFolder = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../packages/db/drizzle",
);

const originalDiditKey = process.env.DIDIT_API_KEY;
afterEach(() => {
  if (originalDiditKey === undefined) delete process.env.DIDIT_API_KEY;
  else process.env.DIDIT_API_KEY = originalDiditKey;
});

describe("runVerificationCheck", () => {
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

  it("uses the dev-mock automatically with no Didit key configured, and unlocks the account", async () => {
    delete process.env.DIDIT_API_KEY;
    const user = await ensureUserForClerkId(db, "clerk_runcheck_pass");

    const result = await runVerificationCheck(db, user.id, {
      selfieFrame: "data:image/jpeg;base64,ZmFrZS1zZWxmaWU=",
      clipFaceSamples: [],
    });

    expect(result.status).toBe("passed");
    expect(result.confidence).toBe(DEV_MOCK_VERIFICATION_CONFIDENCE);

    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, user.id));
    expect(row!.verificationStatus).toBe("passed");
  });

  it("never persists the raw selfie frame anywhere in storage", async () => {
    delete process.env.DIDIT_API_KEY;
    const user = await ensureUserForClerkId(db, "clerk_runcheck_canary");

    // A distinctive marker no legitimate stored value could ever contain,
    // embedded in a realistically large "frame" payload — if any code path
    // ever wrote the raw input into a column (directly, JSON-serialized,
    // or via an accidental `...spread`), this exact string would show up
    // in a full dump of the tables it could plausibly land in.
    const canary = `CANARY-${crypto.randomUUID()}`;
    const fakeSelfie = `data:image/jpeg;base64,${canary}-${"A".repeat(2000)}`;
    const fakeClipSample = `data:image/jpeg;base64,${canary}-CLIP-${"B".repeat(2000)}`;

    await runVerificationCheck(db, user.id, {
      selfieFrame: fakeSelfie,
      clipFaceSamples: [fakeClipSample],
    });

    const verificationRows = await db
      .select()
      .from(schema.verificationRecords)
      .where(eq(schema.verificationRecords.userId, user.id));
    const userRows = await db.select().from(schema.users).where(eq(schema.users.id, user.id));

    expect(verificationRows.length).toBeGreaterThan(0);
    expect(JSON.stringify(verificationRows)).not.toContain(canary);
    expect(JSON.stringify(userRows)).not.toContain(canary);
  });
});
