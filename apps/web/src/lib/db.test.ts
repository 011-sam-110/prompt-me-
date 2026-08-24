import { afterEach, describe, expect, it } from "vitest";
import { shouldUseRealDb } from "./db";

const original = process.env.DATABASE_URL;

afterEach(() => {
  if (original === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = original;
});

describe("shouldUseRealDb", () => {
  it("is false with no DATABASE_URL (the M2 default until Sampo supplies a real Neon string)", () => {
    delete process.env.DATABASE_URL;
    expect(shouldUseRealDb()).toBe(false);
  });

  it("is true once DATABASE_URL is set", () => {
    process.env.DATABASE_URL = "postgres://example";
    expect(shouldUseRealDb()).toBe(true);
  });
});
