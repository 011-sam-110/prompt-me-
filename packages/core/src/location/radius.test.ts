import { describe, expect, it } from "vitest";
import { isValidRadiusKm, MAX_RADIUS_KM, MIN_RADIUS_KM } from "./radius";

describe("isValidRadiusKm", () => {
  it("accepts values inside the bounds, inclusive", () => {
    expect(isValidRadiusKm(MIN_RADIUS_KM)).toBe(true);
    expect(isValidRadiusKm(MAX_RADIUS_KM)).toBe(true);
    expect(isValidRadiusKm(25)).toBe(true); // users.radius_km's default
  });

  it("rejects zero and negative values", () => {
    expect(isValidRadiusKm(0)).toBe(false);
    expect(isValidRadiusKm(-1)).toBe(false);
  });

  it("rejects values below the minimum or above the maximum", () => {
    expect(isValidRadiusKm(MIN_RADIUS_KM - 0.01)).toBe(false);
    expect(isValidRadiusKm(MAX_RADIUS_KM + 0.01)).toBe(false);
  });

  it("rejects non-finite values", () => {
    expect(isValidRadiusKm(Number.NaN)).toBe(false);
    expect(isValidRadiusKm(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isValidRadiusKm(Number.NEGATIVE_INFINITY)).toBe(false);
  });
});
