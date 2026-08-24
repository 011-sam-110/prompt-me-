// ROADMAP.md M4 / ENGINEERING_SPEC.md §4. Mechanical data access only —
// the actual tier-dependency, duration, and prompt-selection *rules* are
// pure functions in @prompt-me/core (packages/core/src/clips/), composed
// with these queries by apps/web/src/lib/clips/upload.ts, mirroring how
// run-check.ts composes @prompt-me/core's verification adapter with
// queries/verification.ts.
import { and, asc, eq } from "drizzle-orm";
import { clips, type Clip, type ModerationStatus } from "../schema/clips";
import type { AnyDb } from "../types";

/** Every tier this user has already uploaded a clip for — the input
 * `checkTierDependency` (@prompt-me/core) needs to decide whether the next
 * tier is allowed. */
export async function getClipTiersForUser(db: AnyDb, userId: string): Promise<number[]> {
  const rows = await db.select({ tier: clips.tier }).from(clips).where(eq(clips.userId, userId));
  return rows.map((row) => row.tier);
}

export async function getClipForUserAndTier(
  db: AnyDb,
  userId: string,
  tier: number,
): Promise<Clip | undefined> {
  const [row] = await db
    .select()
    .from(clips)
    .where(and(eq(clips.userId, userId), eq(clips.tier, tier)));
  return row;
}

/** ENGINEERING_SPEC §4/§12's async post-upload step (apps/web's
 * process-clip.ts) looks a clip back up by id to run transcription +
 * moderation against it. */
export async function getClipById(db: AnyDb, clipId: string): Promise<Clip | undefined> {
  const [row] = await db.select().from(clips).where(eq(clips.id, clipId));
  return row;
}

/**
 * SPEC.md §3: "Lateral scroll = move between one candidate's own clips, in
 * upload order." Ordered by `tier` ascending rather than `created_at`: the
 * upload dependency chain (`checkTierDependency`, §2 — clip N+1 can't be
 * uploaded before clip N exists) already forces tier order and upload order
 * to coincide for any given user, and the schema's own
 * `unique(user_id, tier)` constraint (schema/clips.ts) means there's at
 * most one row per tier to order in the first place — sorting on the
 * column the domain rule actually pins is more direct than trusting a
 * timestamp to agree with it.
 */
export async function getClipsForUserInUploadOrder(db: AnyDb, userId: string): Promise<Clip[]> {
  return db.select().from(clips).where(eq(clips.userId, userId)).orderBy(asc(clips.tier));
}

export interface InsertClipInput {
  userId: string;
  tier: number;
  /** Server-measured duration (@prompt-me/core's probeClipDurationSeconds)
   * — never a client-reported value (ENGINEERING_SPEC §4). */
  durationSeconds: number;
  storageUrl: string;
  promptId?: string | null;
  customPromptText?: string | null;
}

/**
 * Inserts one `clips` row. Named fields explicitly (not `...input`) so an
 * extra property on the caller's object can't silently ride along — same
 * defensive shape as queries/verification.ts's recordVerificationCheck.
 * The `moderation_status` default ("processing", schema/enums.ts) is left
 * untouched here: enqueuing transcription/moderation and flipping it to
 * "approved" is ENGINEERING_SPEC §4/§12's next step, out of scope for this
 * slice of M4.
 */
export async function insertClip(db: AnyDb, input: InsertClipInput): Promise<Clip> {
  const [row] = await db
    .insert(clips)
    .values({
      userId: input.userId,
      tier: input.tier,
      durationSeconds: input.durationSeconds,
      storageUrl: input.storageUrl,
      promptId: input.promptId ?? null,
      customPromptText: input.customPromptText ?? null,
    })
    .returning();

  if (!row) {
    throw new Error(`insertClip: insert returned no row for userId=${input.userId}`);
  }
  return row;
}

/**
 * Writes the Whisper transcription result — ENGINEERING_SPEC §4's async
 * post-upload step. Doesn't touch `moderation_status` at all: the caller
 * (apps/web's process-clip.ts) decides that separately once moderation
 * has also run, via `updateClipModerationStatus` below.
 */
export async function updateClipTranscript(db: AnyDb, clipId: string, transcript: string): Promise<Clip> {
  const [row] = await db.update(clips).set({ transcript }).where(eq(clips.id, clipId)).returning();
  if (!row) {
    throw new Error(`updateClipTranscript: no clip found for id=${clipId}`);
  }
  return row;
}

/**
 * Flips `moderation_status` — ENGINEERING_SPEC §12: "approved" only once
 * transcript + sampled-frame moderation both come back clean, otherwise
 * "pending_review". A plain field update, not a state-machine check here:
 * ENGINEERING_SPEC's transition rule lives in apps/web's process-clip.ts,
 * which decides *which* status to pass in; this function just persists
 * whatever it's told, the same "mechanical data access only" split
 * clips.ts already draws elsewhere in this file.
 */
export async function updateClipModerationStatus(
  db: AnyDb,
  clipId: string,
  moderationStatus: ModerationStatus,
): Promise<Clip> {
  const [row] = await db.update(clips).set({ moderationStatus }).where(eq(clips.id, clipId)).returning();
  if (!row) {
    throw new Error(`updateClipModerationStatus: no clip found for id=${clipId}`);
  }
  return row;
}
