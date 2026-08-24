import { describe, expect, it } from "vitest";
import {
  REWATCH_COOLDOWN_HOURS,
  REWATCH_WINDOW_MINUTES,
  computeCooldownEndsAt,
  computeExpiresAt,
  evaluateRewatchAccess,
  type RewatchSessionSnapshot,
} from "./access";

const NOW = new Date("2026-08-24T12:00:00.000Z");
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

describe("computeExpiresAt", () => {
  it("is openedAt + 15 minutes, using REWATCH_WINDOW_MINUTES rather than a duplicated literal", () => {
    expect(computeExpiresAt(NOW).getTime()).toBe(NOW.getTime() + REWATCH_WINDOW_MINUTES * MINUTE_MS);
    expect(computeExpiresAt(NOW).toISOString()).toBe("2026-08-24T12:15:00.000Z");
  });
});

describe("computeCooldownEndsAt", () => {
  it("is expiresAt + 24 hours, using REWATCH_COOLDOWN_HOURS rather than a duplicated literal", () => {
    expect(computeCooldownEndsAt(NOW).getTime()).toBe(NOW.getTime() + REWATCH_COOLDOWN_HOURS * HOUR_MS);
    expect(computeCooldownEndsAt(NOW).toISOString()).toBe("2026-08-25T12:00:00.000Z");
  });

  it("is computed from the window's close, never its open — SPEC.md §6: 'restarts once that window closes (not from when it opened)'", () => {
    const openedAt = new Date(NOW.getTime() - 3 * HOUR_MS); // window sat open 3h before it expired
    const expiresAt = computeExpiresAt(openedAt); // opened + 15min
    // Cooldown is anchored to expiresAt, so an idle-but-still-open window
    // (one nobody closed and reopened) makes no difference to when the
    // cooldown ends: only the moment it actually expired matters.
    expect(computeCooldownEndsAt(expiresAt).getTime()).toBe(expiresAt.getTime() + REWATCH_COOLDOWN_HOURS * HOUR_MS);
  });
});

describe("evaluateRewatchAccess — no prior session", () => {
  it("creates a new session when the viewer has never rewatched this match before", () => {
    const decision = evaluateRewatchAccess(null, NOW);
    expect(decision.status).toBe("new");
    if (decision.status !== "new") throw new Error("unreachable");
    expect(decision.openedAt.getTime()).toBe(NOW.getTime());
    expect(decision.expiresAt.getTime()).toBe(computeExpiresAt(NOW).getTime());
  });
});

describe("evaluateRewatchAccess — case 1: mid-window", () => {
  it("allows access, returning the EXISTING session's own openedAt/expiresAt verbatim", () => {
    const session: RewatchSessionSnapshot = {
      openedAt: new Date(NOW.getTime() - 5 * MINUTE_MS),
      expiresAt: new Date(NOW.getTime() + 10 * MINUTE_MS), // opened 5m ago, 10m left of the 15m window
    };

    const decision = evaluateRewatchAccess(session, NOW);

    expect(decision.status).toBe("open");
    if (decision.status !== "open") throw new Error("unreachable");
    expect(decision.openedAt.getTime()).toBe(session.openedAt.getTime());
    expect(decision.expiresAt.getTime()).toBe(session.expiresAt.getTime());
  });

  it("allows access one millisecond before the window closes", () => {
    const session: RewatchSessionSnapshot = {
      openedAt: new Date(NOW.getTime() - REWATCH_WINDOW_MINUTES * MINUTE_MS + 1),
      expiresAt: new Date(NOW.getTime() + 1),
    };
    expect(evaluateRewatchAccess(session, NOW).status).toBe("open");
  });

  it("allows access at the instant the window opens (now === openedAt)", () => {
    const session: RewatchSessionSnapshot = { openedAt: NOW, expiresAt: computeExpiresAt(NOW) };
    expect(evaluateRewatchAccess(session, NOW).status).toBe("open");
  });
});

describe("evaluateRewatchAccess — case 2a: just-expired-into-cooldown", () => {
  it("denies with a full 24h remaining at the exact instant the window closes (now === expiresAt)", () => {
    const openedAt = new Date(NOW.getTime() - REWATCH_WINDOW_MINUTES * MINUTE_MS);
    const session: RewatchSessionSnapshot = { openedAt, expiresAt: NOW }; // expires exactly now

    const decision = evaluateRewatchAccess(session, NOW);

    expect(decision.status).toBe("cooldown");
    if (decision.status !== "cooldown") throw new Error("unreachable");
    // now < expiresAt is false at the exact boundary (strict inequality
    // per ENGINEERING_SPEC §8 case 1), so this falls straight into case 2
    // with the full 24h still ahead of it.
    expect(decision.remainingMs).toBe(REWATCH_COOLDOWN_HOURS * HOUR_MS);
    expect(decision.cooldownEndsAt.getTime()).toBe(NOW.getTime() + REWATCH_COOLDOWN_HOURS * HOUR_MS);
  });

  it("denies one millisecond after the window closes", () => {
    const session: RewatchSessionSnapshot = {
      openedAt: new Date(NOW.getTime() - REWATCH_WINDOW_MINUTES * MINUTE_MS - 1),
      expiresAt: new Date(NOW.getTime() - 1),
    };
    const decision = evaluateRewatchAccess(session, NOW);
    expect(decision.status).toBe("cooldown");
    if (decision.status !== "cooldown") throw new Error("unreachable");
    expect(decision.remainingMs).toBe(REWATCH_COOLDOWN_HOURS * HOUR_MS - 1);
  });
});

describe("evaluateRewatchAccess — case 2b: still-in-cooldown", () => {
  it("denies with the correct remaining time partway through the 24h lockout", () => {
    const expiresAt = new Date(NOW.getTime() - 10 * HOUR_MS); // window closed 10h ago
    const session: RewatchSessionSnapshot = { openedAt: new Date(expiresAt.getTime() - 15 * MINUTE_MS), expiresAt };

    const decision = evaluateRewatchAccess(session, NOW);

    expect(decision.status).toBe("cooldown");
    if (decision.status !== "cooldown") throw new Error("unreachable");
    expect(decision.remainingMs).toBe(14 * HOUR_MS); // 24h - 10h already elapsed
    expect(decision.cooldownEndsAt.getTime()).toBe(expiresAt.getTime() + REWATCH_COOLDOWN_HOURS * HOUR_MS);
  });

  it("denies one millisecond before the 24h cooldown fully elapses", () => {
    const expiresAt = new Date(NOW.getTime() - REWATCH_COOLDOWN_HOURS * HOUR_MS + 1);
    const session: RewatchSessionSnapshot = { openedAt: new Date(expiresAt.getTime() - 15 * MINUTE_MS), expiresAt };

    const decision = evaluateRewatchAccess(session, NOW);
    expect(decision.status).toBe("cooldown");
    if (decision.status !== "cooldown") throw new Error("unreachable");
    expect(decision.remainingMs).toBe(1);
  });
});

describe("evaluateRewatchAccess — case 3: cooldown-elapsed", () => {
  it("creates a new session well past the 24h cooldown", () => {
    const expiresAt = new Date(NOW.getTime() - 100 * HOUR_MS);
    const session: RewatchSessionSnapshot = { openedAt: new Date(expiresAt.getTime() - 15 * MINUTE_MS), expiresAt };

    const decision = evaluateRewatchAccess(session, NOW);

    expect(decision.status).toBe("new");
    if (decision.status !== "new") throw new Error("unreachable");
    expect(decision.openedAt.getTime()).toBe(NOW.getTime());
    expect(decision.expiresAt.getTime()).toBe(computeExpiresAt(NOW).getTime());
  });

  it("creates a new session at the exact instant the 24h cooldown elapses (now === cooldownEndsAt)", () => {
    const expiresAt = new Date(NOW.getTime() - REWATCH_COOLDOWN_HOURS * HOUR_MS); // cooldown ends exactly now
    const session: RewatchSessionSnapshot = { openedAt: new Date(expiresAt.getTime() - 15 * MINUTE_MS), expiresAt };

    const decision = evaluateRewatchAccess(session, NOW);

    // cooldownEndsAt > now is false at the exact boundary, so §8 case 2
    // doesn't apply and this falls through to case 3 — a full 24h of
    // lockout has now genuinely elapsed, not 24h-and-a-moment.
    expect(decision.status).toBe("new");
  });
});

describe("evaluateRewatchAccess — reopening the client mid-window doesn't reset the countdown", () => {
  it("returns the SAME expiresAt across repeated calls against the same persisted session, at different 'now's", () => {
    // This is the pure-logic half of SPEC.md §6's guarantee: the session
    // snapshot below stands in for a row already written to the database
    // once, the first time the window opened — nothing here ever recomputes
    // computeExpiresAt from a later `now`, unlike a client-side timer that
    // would reset on every remount.
    const session: RewatchSessionSnapshot = {
      openedAt: new Date(NOW.getTime()),
      expiresAt: computeExpiresAt(NOW),
    };

    const firstCheck = evaluateRewatchAccess(session, new Date(NOW.getTime() + 1 * MINUTE_MS)); // "app" opens
    const secondCheck = evaluateRewatchAccess(session, new Date(NOW.getTime() + 7 * MINUTE_MS)); // closed, reopened later
    const thirdCheck = evaluateRewatchAccess(session, new Date(NOW.getTime() + 14 * MINUTE_MS)); // reopened again, near the end

    for (const decision of [firstCheck, secondCheck, thirdCheck]) {
      expect(decision.status).toBe("open");
      if (decision.status !== "open") throw new Error("unreachable");
      expect(decision.expiresAt.getTime()).toBe(session.expiresAt.getTime());
      expect(decision.openedAt.getTime()).toBe(session.openedAt.getTime());
    }

    // And the window still closes on schedule for a check made after it —
    // the countdown was never extended by any of the earlier re-checks.
    const afterClose = evaluateRewatchAccess(session, new Date(session.expiresAt.getTime() + 1));
    expect(afterClose.status).toBe("cooldown");
  });
});
