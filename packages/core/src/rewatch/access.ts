// Rewatch access — ENGINEERING_SPEC.md §8, SPEC.md §6. Pure, DB-free
// decision (mirrors feed/ranking.ts's split): packages/db's
// rewatch-sessions.ts query fetches the viewer's most recent
// `rewatch_sessions` row for a match, and this module turns that (plus a
// point in time) into the actual grant/deny/create decision —
// apps/web's lib/rewatch/request-rewatch-access.ts composes the two and
// performs the actual insert when a new session is warranted.
//
// SPEC.md §6 states the rule the client must never be trusted to enforce
// itself: "Triggering one opens a 15-minute access window; closing and
// reopening the app doesn't reset it — it keeps counting down from when it
// opened." That guarantee falls straight out of this module's shape: `now`
// is the only thing that ever changes between two calls for the same
// session — `mostRecentSession.expiresAt` is a value already persisted in
// the database the first time the window opened, never recomputed or
// extended by a later request that merely finds it still open (the "open"
// branch below returns the *existing* session's own expiresAt verbatim,
// it never calls computeExpiresAt again). A client closing and reopening
// just means a later call to evaluateRewatchAccess with a later `now`
// against that same unchanged row.

/**
 * ENGINEERING_SPEC §8 / SPEC.md §6: "Triggering one opens a 15-minute
 * access window."
 */
export const REWATCH_WINDOW_MINUTES = 15;

/**
 * SPEC.md §6: "24-hour cooldown between rewatch sessions... restarts once
 * that window closes (not from when it opened) — i.e. always a full 24h of
 * lockout between sessions." Measured from `expiresAt`, never `openedAt` —
 * see `computeCooldownEndsAt`.
 */
export const REWATCH_COOLDOWN_HOURS = 24;

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

/** `openedAt + 15min` — the `expires_at` a brand-new session is written with. */
export function computeExpiresAt(openedAt: Date): Date {
  return new Date(openedAt.getTime() + REWATCH_WINDOW_MINUTES * MINUTE_MS);
}

/**
 * `expiresAt + 24h` — deliberately a function of the *window's close*, not
 * its open, per SPEC.md §6's explicit "not from when it opened." A 15-minute
 * session opened and left untouched still only starts its cooldown once the
 * window itself elapses, not the moment it was triggered.
 */
export function computeCooldownEndsAt(expiresAt: Date): Date {
  return new Date(expiresAt.getTime() + REWATCH_COOLDOWN_HOURS * HOUR_MS);
}

/**
 * The subset of a `rewatch_sessions` row this module needs — always the
 * viewer's *most recent* session for the match (packages/db's
 * getMostRecentRewatchSession already reduces to that; there is at most one
 * row that can matter, since a session can't be created while an earlier
 * one is still open or still cooling down — ENGINEERING_SPEC §8's own
 * algorithm is what keeps that true). `null` means the viewer has never
 * triggered a rewatch for this match before.
 */
export interface RewatchSessionSnapshot {
  openedAt: Date;
  expiresAt: Date;
}

export type RewatchAccessDecision =
  /** Case 1 (§8): an existing session's window hasn't closed yet — access
   * allowed, using that session's own already-persisted expiresAt. No new
   * row, no extension. */
  | { status: "open"; openedAt: Date; expiresAt: Date }
  /** Case 2 (§8): the most recent session's window has closed, but its 24h
   * cooldown hasn't — denied, with the remaining lockout surfaced so the
   * caller can show a countdown instead of a bare refusal. */
  | { status: "cooldown"; cooldownEndsAt: Date; remainingMs: number }
  /** Case 3 (§8): no session exists, or the previous one's cooldown has
   * fully elapsed — a new session should be created starting at `now`. */
  | { status: "new"; openedAt: Date; expiresAt: Date };

/**
 * ENGINEERING_SPEC §8's algorithm, verbatim:
 * 1. If a session exists with `now < expiresAt`, allow (mid-window).
 * 2. Else if the most recent session's `expiresAt + 24h > now`, deny with
 *    the remaining cooldown.
 * 3. Else, a new session should be created.
 *
 * `now` is always an explicit parameter, never read from the ambient clock
 * — the same "no hidden global state" shape `feed/ranking.ts`'s `now`
 * argument already gives this codebase's other time-gated rule, and
 * precisely what makes "closing/reopening the client doesn't reset the
 * countdown" a property of this function rather than a promise about
 * client behavior: two calls against the *same* `mostRecentSession` at two
 * different `now`s are the only way time ever advances here.
 */
export function evaluateRewatchAccess(
  mostRecentSession: RewatchSessionSnapshot | null,
  now: Date,
): RewatchAccessDecision {
  if (mostRecentSession && now.getTime() < mostRecentSession.expiresAt.getTime()) {
    return {
      status: "open",
      openedAt: mostRecentSession.openedAt,
      expiresAt: mostRecentSession.expiresAt,
    };
  }

  if (mostRecentSession) {
    const cooldownEndsAt = computeCooldownEndsAt(mostRecentSession.expiresAt);
    if (cooldownEndsAt.getTime() > now.getTime()) {
      return {
        status: "cooldown",
        cooldownEndsAt,
        remainingMs: cooldownEndsAt.getTime() - now.getTime(),
      };
    }
  }

  return { status: "new", openedAt: now, expiresAt: computeExpiresAt(now) };
}
