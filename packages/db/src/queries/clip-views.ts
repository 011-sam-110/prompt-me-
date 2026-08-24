// clip_views data access — ENGINEERING_SPEC.md §2/§5/§7, ROADMAP.md M5.
// Mechanical only: the actual "has this reported position reached the
// clip's end" decision is @prompt-me/core's hasReachedClipEnd, composed
// here by apps/web's lib/clips/report-view-position.ts — the same split
// queries/clips.ts and queries/verification.ts already draw for their own
// milestones.
import { and, eq } from "drizzle-orm";
import { clipViews, type ClipView } from "../schema/clip-views";
import type { AnyDb } from "../types";

export async function getClipView(
  db: AnyDb,
  viewerId: string,
  clipId: string,
): Promise<ClipView | undefined> {
  const [row] = await db
    .select()
    .from(clipViews)
    .where(and(eq(clipViews.viewerId, viewerId), eq(clipViews.clipId, clipId)));
  return row;
}

export interface RecordClipViewPositionInput {
  viewerId: string;
  profileUserId: string;
  clipId: string;
  /**
   * Whether *this* reported position reaches the clip's end
   * (@prompt-me/core's hasReachedClipEnd) — deliberately the only signal
   * this function's input carries about completion. There is no separate
   * "completed" field a caller could set independently of an actual
   * position check; the type itself makes "just trust what the client
   * said" impossible to wire up by accident.
   */
  reachedEnd: boolean;
}

/**
 * Creates the (viewer, clip) row on first report, or updates it on every
 * later one. `completed` only ever moves false -> true, never back —
 * ENGINEERING_SPEC §7's match detection relies on a completion, once
 * registered, standing even if the viewer later rewinds and replays the
 * same clip — so a report with `reachedEnd: false` after the row is
 * already completed leaves it completed, and `completedAt` is written
 * exactly once, the moment it first flips.
 */
export async function recordClipViewPosition(
  db: AnyDb,
  input: RecordClipViewPositionInput,
): Promise<ClipView> {
  const existing = await getClipView(db, input.viewerId, input.clipId);

  if (!existing) {
    const [row] = await db
      .insert(clipViews)
      .values({
        viewerId: input.viewerId,
        profileUserId: input.profileUserId,
        clipId: input.clipId,
        completed: input.reachedEnd,
        completedAt: input.reachedEnd ? new Date() : null,
      })
      .returning();
    if (!row) {
      throw new Error(
        `recordClipViewPosition: insert returned no row for viewerId=${input.viewerId}, clipId=${input.clipId}`,
      );
    }
    return row;
  }

  if (existing.completed) {
    // Already complete — nothing can move this backward, so this is a
    // no-op read rather than an update.
    return existing;
  }

  const [row] = await db
    .update(clipViews)
    .set({
      completed: input.reachedEnd,
      completedAt: input.reachedEnd ? new Date() : null,
    })
    .where(eq(clipViews.id, existing.id))
    .returning();
  if (!row) {
    throw new Error(`recordClipViewPosition: update returned no row for id=${existing.id}`);
  }
  return row;
}
