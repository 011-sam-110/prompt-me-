import { afterEach, describe, expect, it } from "vitest";
import { isClerkConfigured } from "./config";

const KEYS = ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "CLERK_SECRET_KEY"] as const;
const original = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

afterEach(() => {
  for (const k of KEYS) {
    if (original[k] === undefined) delete process.env[k];
    else process.env[k] = original[k];
  }
});

describe("isClerkConfigured", () => {
  it("is false when neither key is set (the ROADMAP.md M2 default — no real Clerk keys exist yet)", () => {
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    delete process.env.CLERK_SECRET_KEY;
    expect(isClerkConfigured()).toBe(false);
  });

  it("is false when only one of the two keys is set", () => {
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test_x";
    delete process.env.CLERK_SECRET_KEY;
    expect(isClerkConfigured()).toBe(false);

    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    process.env.CLERK_SECRET_KEY = "sk_test_x";
    expect(isClerkConfigured()).toBe(false);
  });

  it("is true only once both keys are set", () => {
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test_x";
    process.env.CLERK_SECRET_KEY = "sk_test_x";
    expect(isClerkConfigured()).toBe(true);
  });
});
