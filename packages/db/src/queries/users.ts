// ROADMAP.md M2: "on first sign-in create a corresponding users row...
// exactly once per account (webhook or server action on session
// creation)".
import { eq } from "drizzle-orm";
import { users, type User } from "../schema/users";
import type { AnyDb } from "../types";

/**
 * Ensures exactly one `users` row exists for a given Clerk account id, and
 * returns it — creating it on first sign-in if it doesn't exist yet.
 *
 * Both of M2's two account-creation triggers (the Clerk webhook in
 * apps/web/src/app/api/webhooks/clerk, and the server-side session check
 * that runs on every authenticated request — apps/web/src/lib/auth) call
 * this same function, so "exactly once" doesn't rely on only one of them
 * ever firing, or on them never racing each other: the `users_clerk_id_idx`
 * UNIQUE index (schema/users.ts) is the actual guarantee. `onConflictDoNothing`
 * turns a second (or concurrent) insert for the same clerkId into a no-op
 * instead of a constraint-violation error; the fallback select then hands
 * back the row that already exists rather than creating a duplicate.
 */
/**
 * Plain lookup by primary key — the "get the viewer's own row" half of
 * ROADMAP.md M6's candidate query (apps/web's lib/feed/get-feed.ts needs
 * the viewer's own `geohash5`/`radiusKm` before it can call
 * @prompt-me/db's getFeedCandidatesForViewer), mirroring queries/clips.ts's
 * getClipById for the same "look this up by id, nothing else" shape.
 */
export async function getUserById(db: AnyDb, userId: string): Promise<User | undefined> {
  const [row] = await db.select().from(users).where(eq(users.id, userId));
  return row;
}

export async function ensureUserForClerkId(db: AnyDb, clerkId: string): Promise<User> {
  const inserted = await db
    .insert(users)
    .values({ clerkId })
    .onConflictDoNothing({ target: users.clerkId })
    .returning();

  if (inserted[0]) {
    return inserted[0];
  }

  const [existing] = await db.select().from(users).where(eq(users.clerkId, clerkId));
  if (!existing) {
    // Only reachable if the row were deleted between the conflicting
    // insert and this select — surfaces loudly rather than silently
    // returning undefined to the caller.
    throw new Error(
      `ensureUserForClerkId: insert conflicted but no row was found for clerkId=${clerkId}`,
    );
  }
  return existing;
}
