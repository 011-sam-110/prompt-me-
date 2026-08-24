// ROADMAP.md M13. The dev-mock branch below is the ONLY one the rest of
// this repo's test suite ever actually exercises — no test file in this
// codebase sets CLERK_SECRET_KEY/NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY outside
// this file's own sandboxed afterEach (lib/auth/config.test.ts's own
// pattern) — which is exactly what guarantees no real Clerk network call,
// and therefore no real email send, can ever happen from a test run.
import { afterEach, describe, expect, it, vi } from "vitest";

const CLERK_KEYS = ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "CLERK_SECRET_KEY"] as const;
const original = Object.fromEntries(CLERK_KEYS.map((k) => [k, process.env[k]]));

afterEach(() => {
  for (const k of CLERK_KEYS) {
    if (original[k] === undefined) delete process.env[k];
    else process.env[k] = original[k];
  }
  vi.doUnmock("@clerk/nextjs/server");
  vi.resetModules();
});

describe("resolveRecipientEmail — dev-mock branch (isClerkConfigured() === false)", () => {
  it("returns a deterministic .invalid address derived from the clerkId, with no network call", async () => {
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    delete process.env.CLERK_SECRET_KEY;
    const { resolveRecipientEmail } = await import("./resolve-recipient-email");

    const email = await resolveRecipientEmail("dev_abc123");

    expect(email).toBe("dev_abc123@dev.prompt-me.invalid");
  });

  it("is stable for the same clerkId across repeated calls (idempotent, not random)", async () => {
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    delete process.env.CLERK_SECRET_KEY;
    const { resolveRecipientEmail } = await import("./resolve-recipient-email");

    const first = await resolveRecipientEmail("dev_stable_user");
    const second = await resolveRecipientEmail("dev_stable_user");

    expect(first).toBe(second);
  });

  it("differs for different clerkIds, so two different users never collide on the same synthetic address", async () => {
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    delete process.env.CLERK_SECRET_KEY;
    const { resolveRecipientEmail } = await import("./resolve-recipient-email");

    const a = await resolveRecipientEmail("dev_user_a");
    const b = await resolveRecipientEmail("dev_user_b");

    expect(a).not.toBe(b);
  });
});

describe("resolveRecipientEmail — real Clerk branch (isClerkConfigured() === true)", () => {
  it("resolves to the account's primary email address", async () => {
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test_x";
    process.env.CLERK_SECRET_KEY = "sk_test_x";

    vi.doMock("@clerk/nextjs/server", () => ({
      clerkClient: vi.fn().mockResolvedValue({
        users: {
          getUser: vi.fn().mockResolvedValue({
            primaryEmailAddressId: "email_primary",
            emailAddresses: [
              { id: "email_other", emailAddress: "other@example.com" },
              { id: "email_primary", emailAddress: "primary@example.com" },
            ],
          }),
        },
      }),
    }));

    const { resolveRecipientEmail } = await import("./resolve-recipient-email");
    const email = await resolveRecipientEmail("user_real_123");

    expect(email).toBe("primary@example.com");
  });

  it("falls back to the first email address when no primary is set", async () => {
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test_x";
    process.env.CLERK_SECRET_KEY = "sk_test_x";

    vi.doMock("@clerk/nextjs/server", () => ({
      clerkClient: vi.fn().mockResolvedValue({
        users: {
          getUser: vi.fn().mockResolvedValue({
            primaryEmailAddressId: null,
            emailAddresses: [{ id: "email_only", emailAddress: "only@example.com" }],
          }),
        },
      }),
    }));

    const { resolveRecipientEmail } = await import("./resolve-recipient-email");
    const email = await resolveRecipientEmail("user_real_456");

    expect(email).toBe("only@example.com");
  });

  it("throws RecipientEmailNotFoundError when the Clerk account has no email address at all", async () => {
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test_x";
    process.env.CLERK_SECRET_KEY = "sk_test_x";

    vi.doMock("@clerk/nextjs/server", () => ({
      clerkClient: vi.fn().mockResolvedValue({
        users: {
          getUser: vi.fn().mockResolvedValue({
            primaryEmailAddressId: null,
            emailAddresses: [],
          }),
        },
      }),
    }));

    const { resolveRecipientEmail, RecipientEmailNotFoundError } = await import("./resolve-recipient-email");

    await expect(resolveRecipientEmail("user_real_no_email")).rejects.toBeInstanceOf(RecipientEmailNotFoundError);
  });
});
