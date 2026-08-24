import { describe, expect, it } from "vitest";
import { newDevClerkId } from "./dev-session";

describe("newDevClerkId", () => {
  it("is namespaced distinctly from a real Clerk user id", () => {
    const id = newDevClerkId();
    expect(id.startsWith("dev_")).toBe(true);
    expect(id.startsWith("user_")).toBe(false);
  });

  it("is unique per call", () => {
    const a = newDevClerkId();
    const b = newDevClerkId();
    expect(a).not.toBe(b);
  });
});
