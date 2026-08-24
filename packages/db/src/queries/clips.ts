// ROADMAP.md M4 / ENGINEERING_SPEC.md §4. Mechanical data access only —
// the actual tier-dependency, duration, and prompt-selection *rules* are
// pure functions in @prompt-me/core (packages/core/src/clips/), composed
// with these queries by apps/web/src/lib/clips/upload.ts, mirroring how
// run-check.ts composes @prompt-me/core's verification adapter with
// queries/verification.ts.
import { and, eq } from "drizzle-orm";
import { clips, type Clip } from "../schema/clips";
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
