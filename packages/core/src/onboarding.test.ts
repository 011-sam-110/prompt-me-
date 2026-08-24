import { describe, expect, it } from "vitest";
import { canAccessFeed, onboardingStateForUser } from "./onboarding";

describe("onboardingStateForUser", () => {
  it("routes a never-verified (pending) account toward verification, feed blocked", () => {
    const state = onboardingStateForUser({ verificationStatus: "pending" });
    expect(state).toBe("needs_verification");
    expect(canAccessFeed(state)).toBe(false);
  });

  it("routes a failed check to a distinct retry state, still blocked", () => {
    const state = onboardingStateForUser({ verificationStatus: "failed" });
    expect(state).toBe("verification_failed");
    expect(state).not.toBe("needs_verification");
    expect(canAccessFeed(state)).toBe(false);
  });

  it("only unlocks the feed once verification_status is passed", () => {
    const state = onboardingStateForUser({ verificationStatus: "passed" });
    expect(state).toBe("active");
    expect(canAccessFeed(state)).toBe(true);
  });
});
