// Clip playback rules — SPEC.md §3, ENGINEERING_SPEC.md §5. Pure, DOM/DB-free
// predicates (mirrors tiers.ts/dependency.ts's split for the upload side) so
// they're testable in isolation and reusable by the eventual mobile port
// (§15) — apps/web's ClipPlayer component and lib/clips/report-view-position.ts
// are the only callers that touch a real <video>/<audio> element or a
// database row.
//
// Two independent gestures live here, per SPEC.md §3: the *vertical* "pass"
// gesture between candidates (hasClearedScrollLock — timeline position on
// clip 1 only), and the *lateral* gesture between one candidate's own clips
// (maxUnlockedClipIndex/clampLateralIndex — server-reported completion, any
// clip). Neither gate depends on the other.

/**
 * ENGINEERING_SPEC §5: completion is reported "to the server on
 * timeupdate/ended", and the *server* marks it complete once the reported
 * position reaches the clip's end. Browsers don't reliably fire `ended`/the
 * final `timeupdate` at exactly `duration` (floating-point media clocks,
 * and 2x-rate playback can overshoot between ticks) — a small tolerance
 * treats "close enough to the end" as reaching it, the same rationale as
 * tiers.ts's CLIP_DURATION_TOLERANCE_SECONDS, applied to playback position
 * instead of upload duration.
 */
export const COMPLETION_POSITION_TOLERANCE_SECONDS = 0.35;

/**
 * The one thing ENGINEERING_SPEC §5 says the *server* must decide: has this
 * reported timeline position reached the clip's end? There is no
 * client-supplied "completed" boolean anywhere in this codebase's upload
 * path to trust or distrust — see report-view-position.ts's input type,
 * which has no field a caller could even set one through — only ever a
 * numeric position, checked here against the clip's own stored duration.
 */
export function hasReachedClipEnd(reportedPositionSeconds: number, durationSeconds: number): boolean {
  if (!Number.isFinite(reportedPositionSeconds) || !Number.isFinite(durationSeconds)) {
    return false;
  }
  return reportedPositionSeconds >= durationSeconds - COMPLETION_POSITION_TOLERANCE_SECONDS;
}

/**
 * SPEC.md §3: "Locked for the first 5 seconds of clip 1." ENGINEERING_SPEC
 * §5: "disabled... until currentTime >= 5s on clip 1" — a fixed *position*
 * threshold, not wall-clock time, matching §3's "gating/completion tracking
 * is measured by position reached in the clip's timeline, not wall-clock
 * time elapsed": holding 2x still has to reach 5 seconds of timeline, it
 * just gets there in 2.5 real seconds.
 */
export const SCROLL_LOCK_SECONDS = 5;

/**
 * Whether the vertical "pass" scroll gesture may fire yet. Only clip 1
 * gates it at all (SPEC.md §3 names clip 1 specifically) — every other
 * clip in a profile's stack leaves the gesture unlocked from the start.
 */
export function hasClearedScrollLock(currentTimeSeconds: number, isFirstClip: boolean): boolean {
  if (!isFirstClip) {
    return true;
  }
  return currentTimeSeconds >= SCROLL_LOCK_SECONDS;
}

/**
 * ENGINEERING_SPEC §5 / SPEC.md §3: "Forward-seek is disabled... Rewind/
 * replay is free; forward-scrubbing... is not." `maxReachedSeconds` is the
 * furthest position natural forward playback has actually reached so far —
 * updated only by real playback (a `timeupdate` tick moving forward), never
 * by a seek itself. Any seek target beyond that gets clamped back down to
 * it; anything at or behind it (a rewind, a replay-from-0) passes through
 * untouched. One rule covers every way a seek could be attempted — there is
 * no scrub-bar UI at all (ClipPlayer never renders native `controls`), but
 * this is the defense-in-depth backstop for anything else that could still
 * move `currentTime` forward (a keyboard shortcut, devtools, a future
 * regression) — all of them are expected to run through this function
 * before a seek is allowed to stick.
 */
export function clampSeekTarget(requestedSeconds: number, maxReachedSeconds: number): number {
  if (!Number.isFinite(requestedSeconds) || requestedSeconds < 0) {
    return 0;
  }
  if (!Number.isFinite(maxReachedSeconds) || maxReachedSeconds < 0) {
    return 0;
  }
  return Math.min(requestedSeconds, maxReachedSeconds);
}

/**
 * SPEC.md §3: "Lateral scroll = move between one candidate's own clips, in
 * upload order" — and the thesis's central rule, restated twice in SPEC.md
 * ("nothing can be skipped", §1; "each clip must finish before the next
 * unlocks... jumping to a later clip is not [allowed]", §3). The vertical
 * scroll-lock above (`hasClearedScrollLock`) only ever gates clip 1's
 * "pass" gesture for 5 seconds; this is the *other* gate SPEC.md §3
 * describes — moving laterally within one profile's own clip stack — and it
 * has nothing to do with wall-clock or timeline position at all: it's
 * gated purely on which earlier clips the server has already reported as
 * complete (the same `completed` boolean ClipPlayer already only ever sets
 * from the server's own response, never a local guess — see
 * report-view-position.ts).
 *
 * `completed[i]` is true once clip *i* (0-indexed, upload order) has been
 * fully watched. The furthest clip reachable is the first one *not yet*
 * completed — you can always be sitting on it, you just can't skip past it
 * to a later one before it finishes.
 */
export function maxUnlockedClipIndex(completed: readonly boolean[]): number {
  if (completed.length === 0) {
    return 0;
  }
  let index = 0;
  while (index < completed.length - 1 && completed[index]) {
    index += 1;
  }
  return index;
}

/**
 * Clamps a requested lateral navigation target (e.g. where a horizontal
 * scroll gesture would land) to `maxUnlockedClipIndex`. Backward navigation
 * — revisiting an earlier, already-unlocked clip — is always allowed
 * (SPEC.md §3: "Rewind/replay is free"); only a *forward* jump past the
 * gate gets pulled back.
 */
export function clampLateralIndex(requestedIndex: number, completed: readonly boolean[]): number {
  if (!Number.isFinite(requestedIndex) || requestedIndex < 0) {
    return 0;
  }
  return Math.min(requestedIndex, maxUnlockedClipIndex(completed));
}
