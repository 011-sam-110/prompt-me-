// moderation_flags data access — ENGINEERING_SPEC.md §2/§12, ROADMAP.md
// M4/M12. Mechanical only, mirroring queries/clips.ts's insertClip: the
// actual "is this flagged, at what confidence" decision comes from
// @prompt-me/core's ModerationProvider; apps/web's process-clip.ts
// composes the two, one row per flagged category per moderation call.
import { eq } from "drizzle-orm";
import { moderationFlags, type ModerationFlag, type NewModerationFlag } from "../schema/moderation-flags";
import type { AnyDb } from "../types";

export interface InsertModerationFlagInput {
  /** Exactly one of clipId/chatMessageId must be set — matches the
   * schema's moderation_flags_target_xor CHECK constraint; this function
   * doesn't re-validate that itself; the constraint is the enforcement. */
  clipId?: string | null;
  chatMessageId?: string | null;
  /** The provider's own category label (e.g. "sexual", "violence") —
   * schema/moderation-flags.ts's flagType column comment. */
  flagType: string;
  confidence: number;
}

export async function insertModerationFlag(
  db: AnyDb,
  input: InsertModerationFlagInput,
): Promise<ModerationFlag> {
  const values: NewModerationFlag = {
    clipId: input.clipId ?? null,
    chatMessageId: input.chatMessageId ?? null,
    flagType: input.flagType,
    confidence: input.confidence,
  };
  const [row] = await db.insert(moderationFlags).values(values).returning();
  if (!row) {
    throw new Error("insertModerationFlag: insert returned no row");
  }
  return row;
}

/** Every flag recorded for one clip — used by tests (and a future human
 * review queue, ROADMAP.md M12) to inspect what a moderation run found. */
export async function getModerationFlagsForClip(db: AnyDb, clipId: string): Promise<ModerationFlag[]> {
  return db.select().from(moderationFlags).where(eq(moderationFlags.clipId, clipId));
}
