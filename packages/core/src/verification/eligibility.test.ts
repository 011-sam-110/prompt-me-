import { describe, expect, it } from "vitest";
import { isEligibleFeedCandidate } from "./eligibility";

describe("isEligibleFeedCandidate", () => {
  it("excludes a never-verified (pending) account", () => {
    expect(isEligibleFeedCandidate({ verificationStatus: "pending" })).toBe(false);
  });

  it("excludes an account whose check failed", () => {
    expect(isEligibleFeedCandidate({ verificationStatus: "failed" })).toBe(false);
  });

  it("includes only a fully passed account", () => {
    expect(isEligibleFeedCandidate({ verificationStatus: "passed" })).toBe(true);
  });
});
