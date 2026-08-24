import { describe, expect, it } from "vitest";
import { canonicalizeMatchPair } from "./pair-order";

describe("canonicalizeMatchPair", () => {
  it("puts the lexicographically smaller id in userAId", () => {
    expect(canonicalizeMatchPair("aaaa", "bbbb")).toEqual({ userAId: "aaaa", userBId: "bbbb" });
  });

  it("produces the identical pair regardless of argument order", () => {
    expect(canonicalizeMatchPair("bbbb", "aaaa")).toEqual({ userAId: "aaaa", userBId: "bbbb" });
    expect(canonicalizeMatchPair("aaaa", "bbbb")).toEqual(canonicalizeMatchPair("bbbb", "aaaa"));
  });

  it("real UUID-shaped ids sort the same way", () => {
    const low = "11111111-1111-1111-1111-111111111111";
    const high = "99999999-9999-9999-9999-999999999999";
    expect(canonicalizeMatchPair(high, low)).toEqual({ userAId: low, userBId: high });
    expect(canonicalizeMatchPair(low, high)).toEqual({ userAId: low, userBId: high });
  });
});
