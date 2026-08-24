import { afterEach, describe, expect, it } from "vitest";
import { DevMockVerificationProvider } from "./dev-mock-provider";
import { DiditVerificationProvider } from "./didit-provider";
import { getVerificationProvider } from "./get-provider";

const KEYS = ["DIDIT_API_KEY", "DIDIT_API_BASE_URL"] as const;
const original = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

afterEach(() => {
  for (const k of KEYS) {
    if (original[k] === undefined) delete process.env[k];
    else process.env[k] = original[k];
  }
});

describe("getVerificationProvider", () => {
  it("returns the dev-mock when no Didit key is configured (ROADMAP.md M3 default)", () => {
    delete process.env.DIDIT_API_KEY;
    expect(getVerificationProvider()).toBeInstanceOf(DevMockVerificationProvider);
  });

  it("returns the real Didit provider once a key is configured", () => {
    process.env.DIDIT_API_KEY = "didit_test_key";
    expect(getVerificationProvider()).toBeInstanceOf(DiditVerificationProvider);
  });
});
