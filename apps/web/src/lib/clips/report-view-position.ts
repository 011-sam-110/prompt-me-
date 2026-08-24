// The composition point ROADMAP.md M5 runs on every position report from
// the player: validates the reported position against @prompt-me/core's
// pure completion rule, then persists it via @prompt-me/db — mirrors how
// lib/clips/upload.ts and lib/verification/run-check.ts each compose core +
// db for their own milestone.
//
// ENGINEERING_SPEC §5: "the server marks clip_views.completed = true when
// position reaches clip end, not the client alone." This function's input
// type is the enforcement of that: `ClipViewPositionInput` below has a
// `positionSeconds` field and nothing else describing completion — there is
// no `completed` boolean anywhere for a caller to set directly. Whether the
// view counts as complete is *always* re-derived here from the clip's own
// stored duration (@prompt-me/core's hasReachedClipEnd), never taken from
// what a caller claims.
//
// This is also the literal "on every clip_views write" point ENGINEERING_SPEC
// §7 hangs match detection off of: once recordClipViewPosition below
// returns, lib/matches/check-and-create-match.ts's checkAndCreateMatchIfMutual
// runs against the row that was just written, every time, unconditionally —
// not just on the reports that happen to complete something.
import { hasReachedClipEnd } from "@prompt-me/core";
import { getClipById, recordClipViewPosition, type AnyDb, type ClipView, type Match } from "@prompt-me/db";
// Relative, not "@/lib/...", deliberately: every other lib/*.ts composition
// point in this codebase (capture-location.ts, run-check.ts, upload.ts)
// only ever imports @prompt-me/core + @prompt-me/db, never another lib/
// module — this is the first cross-domain composition dependency, and the
// "@/..." alias is reserved for the app-layer wiring files (actions.ts,
// route.ts, page.tsx) that sit a level above these, per every existing
// import in this directory.
import { checkAndCreateMatchIfMutual } from "../matches/check-and-create-match";

export interface ClipViewPositionInput {
  viewerId: string;
  clipId: string;
  /** The media element's own `currentTime` at the moment of the report —
   * never a client-computed "did I finish" flag. */
  positionSeconds: number;
}

export type ReportViewPositionError =
  | { code: "clip_not_found"; message: string }
  | { code: "invalid_position"; message: string };

export type ReportViewPositionResult =
  | { ok: true; clipView: ClipView; match: Match | null }
  | { ok: false; error: ReportViewPositionError };

export async function reportClipViewPosition(
  db: AnyDb,
  input: ClipViewPositionInput,
): Promise<ReportViewPositionResult> {
  if (!Number.isFinite(input.positionSeconds) || input.positionSeconds < 0) {
    return {
      ok: false,
      error: { code: "invalid_position", message: "positionSeconds must be a finite number >= 0" },
    };
  }

  const clip = await getClipById(db, input.clipId);
  if (!clip) {
    return { ok: false, error: { code: "clip_not_found", message: `no clip found for id=${input.clipId}` } };
  }

  // profileUserId is derived from the clip's own owner, never taken from
  // the caller — a viewer reports a position against a clipId only, so
  // there's nothing to spoof here even in principle.
  const reachedEnd = hasReachedClipEnd(input.positionSeconds, clip.durationSeconds);
  const clipView = await recordClipViewPosition(db, {
    viewerId: input.viewerId,
    profileUserId: clip.userId,
    clipId: clip.id,
    reachedEnd,
  });

  const match = await checkAndCreateMatchIfMutual(db, clipView);

  return { ok: true, clipView, match };
}
