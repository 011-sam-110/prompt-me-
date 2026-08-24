import { afterEach, describe, expect, it } from "vitest";
import { isDiditConfigured } from "./config";

const original = process.env.DIDIT_API_KEY;

afterEach(() => {
  if (original === undefined) delete process.env.DIDIT_API_KEY;
  else process.env.DIDIT_API_KEY = original;
});

describe("isDiditConfigured", () => {
  it("is false with no DIDIT_API_KEY (the ROADMAP.md default — no real key exists yet)", () => {
    delete process.env.DIDIT_API_KEY;
    expect(isDiditConfigured()).toBe(false);
  });

  it("is false for an empty string (falsy, not just unset)", () => {
    process.env.DIDIT_API_KEY = "";
    expect(isDiditConfigured()).toBe(false);
  });

  it("is true once a key is set", () => {
    process.env.DIDIT_API_KEY = "didit_test_key";
    expect(isDiditConfigured()).toBe(true);
  });
});
