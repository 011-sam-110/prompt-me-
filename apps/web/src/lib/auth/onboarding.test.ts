// ROADMAP.md M2: "Unit tests cover the account-creation -> onboarding-state
// transition" — exercised here at the actual composition point apps/web
// calls from its pages (resolveOnboarding), against a real migrated
// PGlite instance (no live Neon database exists yet — same pattern as
// packages/db/src/schema/schema.test.ts).
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import * as schema from "@prompt-me/db/schema";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveOnboarding } from "./onboarding";

const migrationsFolder = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../packages/db/drizzle",
);

describe("resolveOnboarding", () => {
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

  it("creates the users row and reports needs_verification on a brand-new account", async () => {
    const result = await resolveOnboarding(db, "clerk_web_new_account");
    expect(result.user.clerkId).toBe("clerk_web_new_account");
    expect(result.user.verificationStatus).toBe("pending");
    expect(result.state).toBe("needs_verification");
  });

  it("is idempotent across repeated calls for the same clerkId (exactly-once account creation)", async () => {
    const first = await resolveOnboarding(db, "clerk_web_repeat");
    const second = await resolveOnboarding(db, "clerk_web_repeat");
    expect(second.user.id).toBe(first.user.id);
    expect(second.state).toBe("needs_verification");
  });
});
