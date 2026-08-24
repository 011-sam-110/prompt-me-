import { afterEach, describe, expect, it } from "vitest";
import { isAuthorizedReviewer } from "./reviewer-access";

const KEY = "INTERNAL_REVIEWER_CLERK_IDS";
const original = process.env[KEY];

afterEach(() => {
  if (original === undefined) delete process.env[KEY];
  else process.env[KEY] = original;
});

describe("isAuthorizedReviewer", () => {
  it("allows any signed-in user when the allowlist is unset (today's default — no reviewer accounts exist yet)", () => {
    delete process.env[KEY];
    expect(isAuthorizedReviewer("user_anyone")).toBe(true);
  });

  it("allows any signed-in user when the allowlist is set but empty/whitespace-only", () => {
    process.env[KEY] = "   ";
    expect(isAuthorizedReviewer("user_anyone")).toBe(true);
  });

  it("once set, restricts to exactly the listed ids", () => {
    process.env[KEY] = "user_alice,user_bob";
    expect(isAuthorizedReviewer("user_alice")).toBe(true);
    expect(isAuthorizedReviewer("user_bob")).toBe(true);
    expect(isAuthorizedReviewer("user_charlie")).toBe(false);
  });

  it("trims whitespace and ignores empty entries from stray commas", () => {
    process.env[KEY] = " user_alice , , user_bob ,";
    expect(isAuthorizedReviewer("user_alice")).toBe(true);
    expect(isAuthorizedReviewer("user_bob")).toBe(true);
    expect(isAuthorizedReviewer("")).toBe(false);
  });
});
