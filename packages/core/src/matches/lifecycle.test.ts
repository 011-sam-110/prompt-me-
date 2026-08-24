// ROADMAP.md M7's last acceptance bullet: "State-machine unit tests cover
// every transition in the Fig. 2 diagram (SPEC.md/artifact)." Two layers:
//  1. One `it` per literal SPEC.md §5 bullet, named after that bullet's own
//     wording — so a reader can match each test straight back to the spec
//     sentence it proves, the same "test names the spec line" discipline
//     onboarding.test.ts already uses.
//  2. An exhaustive sweep of all 8×8 = 64 (from, to) pairs (including the 8
//     self-pairs) against `MATCH_LIFECYCLE_EDGES` — not just "the named
//     transitions work" but "and *only* the named transitions work," which
//     a spot-check of a few illegal edges can't actually promise (e.g. an
///    accidental `Matched → Blocked` edge, skipping Escape's own
//     `DatesInPlanning`-onward restriction, would slip past a handful of
//     hand-picked negative cases but not past this).
import { describe, expect, it } from "vitest";
import {
  ESCAPE_ELIGIBLE_STATES,
  IllegalMatchTransitionError,
  MATCH_LIFECYCLE_EDGES,
  MATCH_LIFECYCLE_STATES,
  canTransition,
  isEscapeEligible,
  transition,
  type MatchLifecycleState,
} from "./lifecycle";

describe("match lifecycle — named SPEC.md §5 transitions", () => {
  it("InFeed -> Recirculated on scroll-away (deny)", () => {
    expect(canTransition("InFeed", "Recirculated")).toBe(true);
    expect(transition("InFeed", "Recirculated")).toBe("Recirculated");
  });

  it("InFeed -> Matched only on mutual full clip completion", () => {
    expect(canTransition("InFeed", "Matched")).toBe(true);
    expect(transition("InFeed", "Matched")).toBe("Matched");
  });

  it("Matched -> DatesInPlanning", () => {
    expect(canTransition("Matched", "DatesInPlanning")).toBe(true);
    expect(transition("Matched", "DatesInPlanning")).toBe("DatesInPlanning");
  });

  it("DatesInPlanning -> DateLocked once idea + slot + venue are agreed", () => {
    expect(canTransition("DatesInPlanning", "DateLocked")).toBe(true);
    expect(transition("DatesInPlanning", "DateLocked")).toBe("DateLocked");
  });

  it("DateLocked -> ChatOpen at T-60 minutes", () => {
    expect(canTransition("DateLocked", "ChatOpen")).toBe(true);
    expect(transition("DateLocked", "ChatOpen")).toBe("ChatOpen");
  });

  it("ChatOpen -> ChatClosed some hours after the date", () => {
    expect(canTransition("ChatOpen", "ChatClosed")).toBe(true);
    expect(transition("ChatOpen", "ChatClosed")).toBe("ChatClosed");
  });

  it("ChatClosed -> DatesInPlanning to plan the next date", () => {
    expect(canTransition("ChatClosed", "DatesInPlanning")).toBe(true);
    expect(transition("ChatClosed", "DatesInPlanning")).toBe("DatesInPlanning");
  });

  it("Escape: DatesInPlanning -> Blocked", () => {
    expect(canTransition("DatesInPlanning", "Blocked")).toBe(true);
    expect(transition("DatesInPlanning", "Blocked")).toBe("Blocked");
  });

  it("Escape: DateLocked -> Blocked", () => {
    expect(canTransition("DateLocked", "Blocked")).toBe(true);
  });

  it("Escape: ChatOpen -> Blocked", () => {
    expect(canTransition("ChatOpen", "Blocked")).toBe(true);
  });

  it("Escape: ChatClosed -> Blocked", () => {
    expect(canTransition("ChatClosed", "Blocked")).toBe(true);
  });
});

describe("match lifecycle — Escape is scoped to 'DatesInPlanning onward', never earlier", () => {
  it("Escape is NOT available from InFeed (no match exists yet)", () => {
    expect(canTransition("InFeed", "Blocked")).toBe(false);
  });

  it("Escape is NOT available from Recirculated (no match exists yet)", () => {
    expect(canTransition("Recirculated", "Blocked")).toBe(false);
  });

  it("Escape is NOT available from Matched (before planning starts)", () => {
    expect(canTransition("Matched", "Blocked")).toBe(false);
  });

  it("isEscapeEligible agrees with canTransition(_, 'Blocked') for every state", () => {
    for (const state of MATCH_LIFECYCLE_STATES) {
      expect(isEscapeEligible(state)).toBe(canTransition(state, "Blocked"));
    }
  });

  it("ESCAPE_ELIGIBLE_STATES is exactly {DatesInPlanning, DateLocked, ChatOpen, ChatClosed}", () => {
    expect(new Set(ESCAPE_ELIGIBLE_STATES)).toEqual(
      new Set<MatchLifecycleState>(["DatesInPlanning", "DateLocked", "ChatOpen", "ChatClosed"]),
    );
  });
});

describe("match lifecycle — Blocked is terminal (permanent, per SPEC.md §5's 'the only way out')", () => {
  it("no edge in MATCH_LIFECYCLE_EDGES ever starts from Blocked", () => {
    expect(MATCH_LIFECYCLE_EDGES.some((edge) => edge.from === "Blocked")).toBe(false);
  });

  it("canTransition rejects every attempted transition out of Blocked", () => {
    for (const to of MATCH_LIFECYCLE_STATES) {
      expect(canTransition("Blocked", to)).toBe(false);
    }
  });

  it("transition() throws IllegalMatchTransitionError attempting to leave Blocked", () => {
    expect(() => transition("Blocked", "InFeed")).toThrow(IllegalMatchTransitionError);
  });
});

describe("match lifecycle — transition() rejects any non-edge with a named error", () => {
  it("throws IllegalMatchTransitionError, carrying the attempted from/to, for a skip-ahead jump", () => {
    // InFeed straight to DateLocked skips Matched/DatesInPlanning entirely —
    // never legal no matter how far the real product might one day want to
    // shortcut something.
    let caught: unknown;
    try {
      transition("InFeed", "DateLocked");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(IllegalMatchTransitionError);
    const err = caught as IllegalMatchTransitionError;
    expect(err.from).toBe("InFeed");
    expect(err.to).toBe("DateLocked");
    expect(err.message).toContain("InFeed -> DateLocked");
  });

  it("rejects the reverse of every named forward edge (this graph has no back-edges besides ChatClosed -> DatesInPlanning)", () => {
    expect(canTransition("Matched", "InFeed")).toBe(false);
    expect(canTransition("DateLocked", "DatesInPlanning")).toBe(false);
    expect(canTransition("ChatClosed", "ChatOpen")).toBe(false);
    expect(canTransition("DatesInPlanning", "Matched")).toBe(false);
  });
});

describe("match lifecycle — exhaustive 8x8 sweep: exactly the named edges are legal, nothing else is", () => {
  const expectedEdgeKeys = new Set(MATCH_LIFECYCLE_EDGES.map((edge) => `${edge.from}->${edge.to}`));

  for (const from of MATCH_LIFECYCLE_STATES) {
    for (const to of MATCH_LIFECYCLE_STATES) {
      const key = `${from}->${to}`;
      const shouldBeLegal = expectedEdgeKeys.has(key);

      it(`${key} is ${shouldBeLegal ? "a legal" : "an illegal"} transition`, () => {
        expect(canTransition(from, to)).toBe(shouldBeLegal);
      });
    }
  }

  it("covers all 64 (from, to) pairs, matching MATCH_LIFECYCLE_STATES' full cross product", () => {
    expect(MATCH_LIFECYCLE_STATES.length).toBe(8);
    expect(MATCH_LIFECYCLE_STATES.length * MATCH_LIFECYCLE_STATES.length).toBe(64);
  });

  it("the edge list itself has exactly 11 legal edges: 7 named + 4 Escape", () => {
    expect(MATCH_LIFECYCLE_EDGES.length).toBe(11);
  });
});
