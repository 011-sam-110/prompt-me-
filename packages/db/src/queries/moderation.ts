// moderation_flags data access — ENGINEERING_SPEC.md §2/§12, ROADMAP.md
// M4/M12. Mechanical only, mirroring queries/clips.ts's insertClip: the
// actual "is this flagged, at what confidence" decision comes from
// @prompt-me/core's ModerationProvider; apps/web's process-clip.ts
// composes the two, one row per flagged category per moderation call.
import { asc, eq } from "drizzle-orm";
import { chatMessages, type ChatMessage } from "../schema/chat-messages";
import { clips, type Clip } from "../schema/clips";
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

/** Every flag recorded for one clip — used by tests, and by apps/web's
 * lib/moderation/review-flag.ts to re-derive a clip's overall
 * moderation_status (via @prompt-me/core's
 * deriveClipModerationStatusAfterReview) after one of its flags is
 * reviewed. */
export async function getModerationFlagsForClip(db: AnyDb, clipId: string): Promise<ModerationFlag[]> {
  return db.select().from(moderationFlags).where(eq(moderationFlags.clipId, clipId));
}

/** Every flag recorded for one chat message — the chat-side counterpart of
 * getModerationFlagsForClip above, used by tests and available to a future
 * per-message moderation view; ROADMAP.md M12's review queue itself reads
 * getPendingChatModerationFlags instead (already scoped to unreviewed
 * rows across every message, not one message at a time). */
export async function getModerationFlagsForChatMessage(db: AnyDb, chatMessageId: string): Promise<ModerationFlag[]> {
  return db.select().from(moderationFlags).where(eq(moderationFlags.chatMessageId, chatMessageId));
}

/** One flag by id — apps/web's lib/moderation/review-flag.ts looks a flag
 * up before acting on it (both to 404 a bad id cleanly, and because the
 * action itself needs to know which of clip_id/chat_message_id is set). */
export async function getModerationFlagById(db: AnyDb, id: string): Promise<ModerationFlag | undefined> {
  const [row] = await db.select().from(moderationFlags).where(eq(moderationFlags.id, id));
  return row;
}

/**
 * The human-review-queue action (ROADMAP.md M12): marks one flag reviewed
 * with the reviewer's decision. Idempotent — reviewing an already-reviewed
 * flag again just re-applies whatever `actionTaken` this call is given,
 * same posture as removeChatMessage/updateClipModerationStatus elsewhere
 * in this package; apps/web's lib/moderation/review-flag.ts is what
 * decides *whether* re-review should be allowed at the UI layer, not this
 * function.
 */
export async function markModerationFlagReviewed(
  db: AnyDb,
  id: string,
  actionTaken: "cleared" | "removed",
): Promise<ModerationFlag> {
  const [row] = await db
    .update(moderationFlags)
    .set({ reviewed: true, actionTaken })
    .where(eq(moderationFlags.id, id))
    .returning();
  if (!row) {
    throw new Error(`markModerationFlagReviewed: no moderation_flags row for id=${id}`);
  }
  return row;
}

export interface PendingClipModerationFlag {
  flag: ModerationFlag;
  clip: Clip;
}

/**
 * Every unreviewed clip-targeted flag, oldest first — the clip half of
 * ROADMAP.md M12's review queue. An inner join, not a `clipId IS NOT
 * NULL` filter: the schema's own moderation_flags_target_xor CHECK
 * already guarantees a clip-targeted flag has a real `clips` row to join
 * against, so this reads as "every pending flag that has a clip," which a
 * plain null-check would only be an indirect way of saying.
 */
export async function getPendingClipModerationFlags(db: AnyDb): Promise<PendingClipModerationFlag[]> {
  return db
    .select({ flag: moderationFlags, clip: clips })
    .from(moderationFlags)
    .innerJoin(clips, eq(moderationFlags.clipId, clips.id))
    .where(eq(moderationFlags.reviewed, false))
    .orderBy(asc(moderationFlags.createdAt));
}

export interface PendingChatModerationFlag {
  flag: ModerationFlag;
  chatMessage: ChatMessage;
}

/** Every unreviewed chat-message-targeted flag, oldest first — the chat
 * half of ROADMAP.md M12's review queue. Same inner-join reasoning as
 * getPendingClipModerationFlags above. */
export async function getPendingChatModerationFlags(db: AnyDb): Promise<PendingChatModerationFlag[]> {
  return db
    .select({ flag: moderationFlags, chatMessage: chatMessages })
    .from(moderationFlags)
    .innerJoin(chatMessages, eq(moderationFlags.chatMessageId, chatMessages.id))
    .where(eq(moderationFlags.reviewed, false))
    .orderBy(asc(moderationFlags.createdAt));
}
