import { describe, expect, it } from "vitest";
import { deriveClipModerationStatusAfterReview, type ModerationFlagReviewSnapshot } from "./clip-review";

function flag(overrides: Partial<ModerationFlagReviewSnapshot> = {}): ModerationFlagReviewSnapshot {
  return { reviewed: false, actionTaken: null, ...overrides };
}

describe("deriveClipModerationStatusAfterReview", () => {
  it("stays pending_review while any flag is unreviewed, even if others are already cleared", () => {
    const flags = [flag({ reviewed: true, actionTaken: "cleared" }), flag()];
    expect(deriveClipModerationStatusAfterReview(flags)).toBe("pending_review");
  });

  it("returns approved once every flag is reviewed and none were removed", () => {
    const flags = [
      flag({ reviewed: true, actionTaken: "cleared" }),
      flag({ reviewed: true, actionTaken: "cleared" }),
    ];
    expect(deriveClipModerationStatusAfterReview(flags)).toBe("approved");
  });

  it("returns rejected the instant any one flag is removed, regardless of the others", () => {
    const flags = [flag({ reviewed: true, actionTaken: "removed" }), flag()];
    expect(deriveClipModerationStatusAfterReview(flags)).toBe("rejected");
  });

  it("removed stays sticky even after every other flag is separately cleared", () => {
    // A reviewer takes one category down, then clears the rest — clearing
    // "harassment" was never a claim that the "sexual" hit reviewed
    // earlier was fine after all.
    const flags = [
      flag({ reviewed: true, actionTaken: "removed" }),
      flag({ reviewed: true, actionTaken: "cleared" }),
      flag({ reviewed: true, actionTaken: "cleared" }),
    ];
    expect(deriveClipModerationStatusAfterReview(flags)).toBe("rejected");
  });

  it("order of review doesn't matter — a pure function of the current flag set", () => {
    const allClearedThenOneRemoved = [
      flag({ reviewed: true, actionTaken: "cleared" }),
      flag({ reviewed: true, actionTaken: "removed" }),
    ];
    const oneRemovedThenCleared = [
      flag({ reviewed: true, actionTaken: "removed" }),
      flag({ reviewed: true, actionTaken: "cleared" }),
    ];
    expect(deriveClipModerationStatusAfterReview(allClearedThenOneRemoved)).toBe("rejected");
    expect(deriveClipModerationStatusAfterReview(oneRemovedThenCleared)).toBe("rejected");
  });

  it("a clip with no recorded flags is trivially approved (never actually reached in practice — this fn is only ever called with the flag just reviewed included)", () => {
    expect(deriveClipModerationStatusAfterReview([])).toBe("approved");
  });
});
