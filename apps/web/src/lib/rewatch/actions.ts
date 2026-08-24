"use server";
// Server action backing a future "rewatch" control (M9's planning UI is
// where it'll actually be tapped from — no such surface exists yet, the
// same milestone boundary lib/matches/actions.ts's own comment draws for
// Escape). Resolves who's signed in, ensures their `users` row exists, then
// delegates to the composition point — mirrors lib/matches/actions.ts's
// shape exactly, `now` deliberately left at request-rewatch-access.ts's
// real-clock default rather than threaded through here, since a real
// server action always means a real request, never a test.
import { redirect } from "next/navigation";
import { ensureUserForClerkId } from "@prompt-me/db";
import { getAppDb } from "@/lib/db";
import { getAuthSession } from "@/lib/auth/session";
import { requestRewatchAccess, type RequestRewatchAccessResult } from "./request-rewatch-access";

/**
 * `matchId` is the `matches` row the signed-in user wants a rewatch session
 * for. Throws `RewatchMatchAccessError` (request-rewatch-access.ts) if the
 * signed-in user isn't actually a participant in that match.
 */
export async function submitRewatchRequest(matchId: string): Promise<RequestRewatchAccessResult> {
  const { clerkId } = await getAuthSession();
  if (!clerkId) {
    redirect("/sign-in");
  }

  const db = await getAppDb();
  const user = await ensureUserForClerkId(db, clerkId);
  return requestRewatchAccess(db, matchId, user.id);
}
