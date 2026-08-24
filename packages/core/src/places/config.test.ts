import { afterEach, describe, expect, it } from "vitest";
import { isGooglePlacesConfigured } from "./config";

const original = process.env.GOOGLE_PLACES_API_KEY;

afterEach(() => {
  if (original === undefined) delete process.env.GOOGLE_PLACES_API_KEY;
  else process.env.GOOGLE_PLACES_API_KEY = original;
});

describe("isGooglePlacesConfigured", () => {
  it("is false with no GOOGLE_PLACES_API_KEY (the ROADMAP.md default — no real key exists yet)", () => {
    delete process.env.GOOGLE_PLACES_API_KEY;
    expect(isGooglePlacesConfigured()).toBe(false);
  });

  it("is false for an empty string (falsy, not just unset)", () => {
    process.env.GOOGLE_PLACES_API_KEY = "";
    expect(isGooglePlacesConfigured()).toBe(false);
  });

  it("is true once a key is set", () => {
    process.env.GOOGLE_PLACES_API_KEY = "test-places-key";
    expect(isGooglePlacesConfigured()).toBe(true);
  });
});
