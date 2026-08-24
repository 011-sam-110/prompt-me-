import { afterEach, describe, expect, it } from "vitest";
import { isResendConfigured } from "./config";

const KEYS = ["RESEND_API_KEY", "RESEND_FROM_EMAIL"] as const;
const original = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

afterEach(() => {
  for (const k of KEYS) {
    if (original[k] === undefined) delete process.env[k];
    else process.env[k] = original[k];
  }
});

describe("isResendConfigured", () => {
  it("is false when neither var is set (the ROADMAP.md M13 default — no real Resend key exists yet)", () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;
    expect(isResendConfigured()).toBe(false);
  });

  it("is false when only the API key is set (no from-address to send from)", () => {
    process.env.RESEND_API_KEY = "re_test_key";
    delete process.env.RESEND_FROM_EMAIL;
    expect(isResendConfigured()).toBe(false);
  });

  it("is false when only the from-address is set", () => {
    delete process.env.RESEND_API_KEY;
    process.env.RESEND_FROM_EMAIL = "notifications@prompt-me.app";
    expect(isResendConfigured()).toBe(false);
  });

  it("is true only once both are set", () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.RESEND_FROM_EMAIL = "notifications@prompt-me.app";
    expect(isResendConfigured()).toBe(true);
  });
});
