// The full match lifecycle — SPEC.md §5 ("The match lifecycle"), the "Fig.
// 2 diagram" ROADMAP.md M7's last acceptance bullet names. Pure, DB-free
// state machine: every state SPEC.md §5 names, and every transition its
// prose describes, modeled as an explicit edge list rather than scattered
// `if` statements — so "does every named transition actually work, and is
// everything else actually rejected" is one exhaustive test
// (lifecycle.test.ts) instead of a checklist taken on trust.
//
// This is a *design*-level model, not (yet) a 1:1 mirror of what's
// persisted. Today only two of these eight states have their own database
// column at all: `matches.status` (schema/matches.ts) is a two-value enum,
// "active" | "blocked" — it does not yet distinguish Matched from
// DatesInPlanning from DateLocked from ChatOpen from ChatClosed, because
// the tables that would carry those finer distinctions
// (`date_proposals`/`calendar_slots` for M9, `chat_windows` for M9/§8) don't
// exist yet. Until they do, `matches.status = "active"` collectively means
// "somewhere at or after Matched, not blocked" — every one of
// {Matched, DatesInPlanning, DateLocked, ChatOpen, ChatClosed} — and
// `"blocked"` means the terminal `Blocked` state below. `InFeed`/
// `Recirculated` likewise aren't a `users`/`matches` column; they're
// `feed_decisions` rows + packages/core/src/feed/ranking.ts's resurfacing
// math (M6). This module exists so the *complete* lifecycle SPEC.md §5
// describes has one tested, authoritative shape now, ready for M8/M9/M10 to
// wire their own persisted sub-states against without redesigning the
// graph — see queries/matches.ts's blockMatch for exactly where today's
// two-value reality currently sits inside this richer model.
export type MatchLifecycleState =
  | "InFeed"
  | "Recirculated"
  | "Matched"
  | "DatesInPlanning"
  | "DateLocked"
  | "ChatOpen"
  | "ChatClosed"
  | "Blocked";

export const MATCH_LIFECYCLE_STATES: readonly MatchLifecycleState[] = [
  "InFeed",
  "Recirculated",
  "Matched",
  "DatesInPlanning",
  "DateLocked",
  "ChatOpen",
  "ChatClosed",
  "Blocked",
];

export interface MatchLifecycleEdge {
  from: MatchLifecycleState;
  to: MatchLifecycleState;
}

/**
 * Every non-Escape transition, one entry per SPEC.md §5 bullet, in the
 * order that section lists them:
 *  - "InFeed → Recirculated on scroll-away (deny)."
 *  - "InFeed → Matched only when both people finish watching all of each
 *    other's uploaded clips."
 *  - "Matched → DatesInPlanning, and the pair is permanently removed from
 *    both people's future discovery feeds."
 *  - "DatesInPlanning → DateLocked once an idea, a slot, and a
 *    public-venue meeting place are all agreed."
 *  - "DateLocked → ChatOpen at T-60 minutes before the date."
 *  - "ChatOpen → ChatClosed some hours after the date."
 *  - "ChatClosed → DatesInPlanning to plan the next date with the same
 *    match."
 * "Recirculated profiles return to the feed later, at lower priority" is
 * deliberately *not* modeled as a `Recirculated → InFeed` edge here: that
 * sentence describes the resurfacing behavior packages/core/src/feed/
 * ranking.ts's `isResurfaceEligible` already implements (a denied profile
 * becomes an ordinary ranked candidate again, at a score penalty, once its
 * 48h window elapses) rather than a distinct state transition SPEC.md §5
 * draws with its own arrow — adding an edge the spec's prose doesn't
 * literally state would be this file overclaiming, not documenting.
 */
const LIFECYCLE_EDGES: readonly MatchLifecycleEdge[] = [
  { from: "InFeed", to: "Recirculated" },
  { from: "InFeed", to: "Matched" },
  { from: "Matched", to: "DatesInPlanning" },
  { from: "DatesInPlanning", to: "DateLocked" },
  { from: "DateLocked", to: "ChatOpen" },
  { from: "ChatOpen", to: "ChatClosed" },
  { from: "ChatClosed", to: "DatesInPlanning" },
];

/**
 * "Escape: available any time from DatesInPlanning onward." — every state
 * from `DatesInPlanning` on (inclusive) except the terminal `Blocked`
 * itself. Named separately from `LIFECYCLE_EDGES` above because this is the
 * one transition this milestone (M7) actually wires to a real database
 * write (queries/matches.ts's blockMatch) — the rest of this module is
 * still a design-only model until M8/M9/M10 exist, but Escape/block is
 * live today.
 */
export const ESCAPE_ELIGIBLE_STATES: readonly MatchLifecycleState[] = [
  "DatesInPlanning",
  "DateLocked",
  "ChatOpen",
  "ChatClosed",
];

const ESCAPE_EDGES: readonly MatchLifecycleEdge[] = ESCAPE_ELIGIBLE_STATES.map((from) => ({
  from,
  to: "Blocked" as const,
}));

/**
 * The complete, authoritative edge list — every transition SPEC.md §5
 * permits and nothing else. `Blocked` has no outgoing edge in this list at
 * all (it never appears as a `from`): "One tap = unmatch + permanent
 * block... the only way out of a live match" makes it explicitly terminal,
 * not just unreached by the other bullets.
 */
export const MATCH_LIFECYCLE_EDGES: readonly MatchLifecycleEdge[] = [
  ...LIFECYCLE_EDGES,
  ...ESCAPE_EDGES,
];

/** Whether `from → to` is a legal transition per SPEC.md §5. */
export function canTransition(from: MatchLifecycleState, to: MatchLifecycleState): boolean {
  return MATCH_LIFECYCLE_EDGES.some((edge) => edge.from === from && edge.to === to);
}

/** Whether Escape may fire from this state ("any time from DatesInPlanning onward"). */
export function isEscapeEligible(state: MatchLifecycleState): boolean {
  return (ESCAPE_ELIGIBLE_STATES as readonly string[]).includes(state);
}

/** Thrown by `transition` for any `from → to` pair `canTransition` rejects. */
export class IllegalMatchTransitionError extends Error {
  readonly from: MatchLifecycleState;
  readonly to: MatchLifecycleState;

  constructor(from: MatchLifecycleState, to: MatchLifecycleState) {
    super(`Illegal match lifecycle transition: ${from} -> ${to}`);
    this.name = "IllegalMatchTransitionError";
    this.from = from;
    this.to = to;
  }
}

/**
 * Applies a transition, throwing `IllegalMatchTransitionError` rather than
 * silently returning `to` (or `from`) for anything `canTransition` doesn't
 * allow — a state machine that accepts an illegal edge without complaint is
 * indistinguishable from having no rules at all.
 */
export function transition(from: MatchLifecycleState, to: MatchLifecycleState): MatchLifecycleState {
  if (!canTransition(from, to)) {
    throw new IllegalMatchTransitionError(from, to);
  }
  return to;
}
