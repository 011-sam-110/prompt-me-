"use server";
// Server action backing the player UI (components/player/clip-player.tsx).
// Resolves who's signed in, ensures their `users` row exists (same
// exactly-once guarantee M2's resolveOnboarding relies on), then runs the
// report. Mirrors lib/verification/actions.ts's shape exactly.
//
// This is the actual "report timeline position to the server" call
// ENGINEERING_SPEC §5 describes — its only input is a clip id and a
// numeric position. There is deliberately no parameter here (or anywhere
// downstream in report-view-position.ts / recordClipViewPosition) through
// which a caller could pass a "completed" flag directly; the player never
// sets its own completed state from anything but this call's return value.
import { ensureUserForClerkId } from "@prompt-me/db";
import { getAppDb } from "@/lib/db";
import { getAuthSession } from "@/lib/auth/session";
import { reportClipViewPosition } from "./report-view-position";

export interface ClipViewPositionResult {
  completed: boolean;
  /** ENGINEERING_SPEC §7: whether this report was the one that completed
   * mutual full-completion in both directions. Most reports leave this
   * `false` — it only flips on the specific write that closes the loop. */
  matched: boolean;
}

export async function submitClipViewPosition(
  clipId: string,
  positionSeconds: number,
): Promise<ClipViewPositionResult> {
  const { clerkId } = await getAuthSession();
  if (!clerkId) {
    throw new Error("submitClipViewPosition: not signed in");
  }

  const db = await getAppDb();
  const viewer = await ensureUserForClerkId(db, clerkId);

  const result = await reportClipViewPosition(db, { viewerId: viewer.id, clipId, positionSeconds });
  if (!result.ok) {
    throw new Error(`submitClipViewPosition: ${result.error.code} — ${result.error.message}`);
  }

  return { completed: result.clipView.completed, matched: result.match !== null };
}
