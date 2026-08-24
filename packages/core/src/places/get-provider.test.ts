import { afterEach, describe, expect, it } from "vitest";
import { DevMockPlacesProvider } from "./dev-mock-provider";
import { GooglePlacesProvider } from "./google-places-provider";
import { getPlacesProvider } from "./get-provider";

const KEYS = ["GOOGLE_PLACES_API_KEY", "GOOGLE_PLACES_API_BASE_URL"] as const;
const original = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

afterEach(() => {
  for (const k of KEYS) {
    if (original[k] === undefined) delete process.env[k];
    else process.env[k] = original[k];
  }
});

describe("getPlacesProvider", () => {
  it("returns the dev-mock when no Google Places key is configured (ROADMAP.md M9 default)", () => {
    delete process.env.GOOGLE_PLACES_API_KEY;
    expect(getPlacesProvider()).toBeInstanceOf(DevMockPlacesProvider);
  });

  it("returns the real Google Places provider once a key is configured", () => {
    process.env.GOOGLE_PLACES_API_KEY = "test-places-key";
    expect(getPlacesProvider()).toBeInstanceOf(GooglePlacesProvider);
  });
});
