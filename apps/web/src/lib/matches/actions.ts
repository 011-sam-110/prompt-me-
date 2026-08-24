"use server";
// Server action backing a future Escape control (M9's planning UI is where
// it'll actually be tapped from — SPEC.md §5's "one tap" — no such surface
// exists yet, same milestone boundary M6/M7's other composition points
// already draw). Mirrors lib/verification/actions.ts's / lib/location/actions.ts's
// shape exactly: resolve who's signed in, ensure their `users` row exists,
// then delegate to the composition point.
import { redirect } from "next/navigation";
import { ensureUserForClerkId, type Match } from "@prompt-me/db";
import { getAppDb } from "@/lib/db";
import { getAuthSession } from "@/lib/auth/session";
import { escapeMatch } from "./escape-match";

export interface SubmitEscapeMatchResult {
  status: Match["status"];
}

/**
 * `otherUserId` is the other side of the match the signed-in user is
 * escaping — a single action, per SPEC.md §5: "One tap = unmatch +
 * permanent block." Throws `MatchNotFoundError` (@prompt-me/db) if no match
 * exists between the two at all.
 */
export async function submitEscapeMatch(otherUserId: string): Promise<SubmitEscapeMatchResult> {
  const { clerkId } = await getAuthSession();
  if (!clerkId) {
    redirect("/sign-in");
  }

  const db = await getAppDb();
  const user = await ensureUserForClerkId(db, clerkId);
  const match = await escapeMatch(db, user.id, otherUserId);
  return { status: match.status };
}
