import { describe, expect, it } from "vitest";
import { DEV_MOCK_VERIFICATION_CONFIDENCE, DevMockVerificationProvider } from "./dev-mock-provider";

describe("DevMockVerificationProvider", () => {
  it("always returns a pass on both sub-checks with the fixed confidence score", async () => {
    const provider = new DevMockVerificationProvider();
    const result = await provider.check({ selfieFrame: "data:image/jpeg;base64,AAAA", clipFaceSamples: [] });
    expect(result).toEqual({
      livenessResult: "pass",
      ageEstimateResult: "pass",
      confidence: DEV_MOCK_VERIFICATION_CONFIDENCE,
    });
  });

  it("is deterministic: wildly different input never changes the result", async () => {
    const provider = new DevMockVerificationProvider();
    const a = await provider.check({ selfieFrame: "", clipFaceSamples: [] });
    const b = await provider.check({
      selfieFrame: "data:image/png;base64," + "z".repeat(5000),
      clipFaceSamples: ["frame-1", "frame-2"],
    });
    expect(a).toEqual(b);
  });
});
