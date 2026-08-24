import { describe, expect, it } from "vitest";
import { deriveOverallVerificationStatus } from "./status";

describe("deriveOverallVerificationStatus", () => {
  it("passes only when both liveness and age-estimate pass", () => {
    expect(
      deriveOverallVerificationStatus({ livenessResult: "pass", ageEstimateResult: "pass", confidence: 0.9 }),
    ).toBe("passed");
  });

  it("fails when liveness fails, even if age-estimate passes", () => {
    expect(
      deriveOverallVerificationStatus({ livenessResult: "fail", ageEstimateResult: "pass", confidence: 0.9 }),
    ).toBe("failed");
  });

  it("fails when age-estimate fails, even if liveness passes", () => {
    expect(
      deriveOverallVerificationStatus({ livenessResult: "pass", ageEstimateResult: "fail", confidence: 0.9 }),
    ).toBe("failed");
  });

  it("fails when both fail", () => {
    expect(
      deriveOverallVerificationStatus({ livenessResult: "fail", ageEstimateResult: "fail", confidence: 0.1 }),
    ).toBe("failed");
  });
});
