import { afterEach, describe, expect, it } from "vitest";
import { DevMockNotificationProvider } from "./dev-mock-provider";
import { getNotificationProvider } from "./get-provider";
import { ResendNotificationProvider } from "./resend-provider";

const KEYS = ["RESEND_API_KEY", "RESEND_FROM_EMAIL", "RESEND_API_BASE_URL"] as const;
const original = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

afterEach(() => {
  for (const k of KEYS) {
    if (original[k] === undefined) delete process.env[k];
    else process.env[k] = original[k];
  }
});

describe("getNotificationProvider", () => {
  it("returns the dev-mock when no Resend credentials are configured — the whole test suite's default", () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;
    expect(getNotificationProvider()).toBeInstanceOf(DevMockNotificationProvider);
  });

  it("returns the real Resend provider once both credentials are configured", () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.RESEND_FROM_EMAIL = "notifications@prompt-me.app";
    expect(getNotificationProvider()).toBeInstanceOf(ResendNotificationProvider);
  });
});
