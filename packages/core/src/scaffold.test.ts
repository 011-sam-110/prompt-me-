import { describe, expect, it } from "vitest";
import { ping } from "./scaffold";

describe("scaffold placeholder", () => {
  it("proves the workspace test runner actually executes", () => {
    expect(ping()).toBe("pong");
  });
});
