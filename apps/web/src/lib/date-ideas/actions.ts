"use server";
// Server actions backing the generated-ideas UI
// (components/date-ideas/generated-ideas-panel.tsx) — mirrors
// lib/date-proposals/actions.ts's shape exactly: resolve who's signed in,
// ensure their `users` row exists, then delegate to the relevant
// composition point.
import { redirect } from "next/navigation";
import { ensureUserForClerkId, type DateIdeaGenerated, type DateProposal } from "@prompt-me/db";
import { getAppDb } from "@/lib/db";
import { getAuthSession } from "@/lib/auth/session";
import { getOrGenerateIdeas } from "./get-or-generate-ideas";
import { proposeGeneratedDate } from "./propose-generated";

async function requireSignedInUser() {
  const { clerkId } = await getAuthSession();
  if (!clerkId) {
    redirect("/sign-in");
  }
  const db = await getAppDb();
  const user = await ensureUserForClerkId(db, clerkId);
  return { db, user };
}

/**
 * ROADMAP.md M10: "A 'suggest new ideas' action forces regeneration." A
 * dedicated action (rather than a `forceRegenerate` flag threaded through
 * from the client) so the client surface for "give me a fresh pair" is a
 * single, explicit call with no way to accidentally regenerate on a normal
 * page load.
 */
export async function submitRegenerateIdeas(matchId: string): Promise<DateIdeaGenerated[]> {
  const { db, user } = await requireSignedInUser();
  return getOrGenerateIdeas(db, matchId, user.id, { forceRegenerate: true });
}

export async function submitProposeGeneratedDate(
  matchId: string,
  generatedIdeaId: string,
  slotStartAtIso: string,
  slotEndAtIso: string,
): Promise<DateProposal> {
  const { db, user } = await requireSignedInUser();
  return proposeGeneratedDate(db, matchId, user.id, {
    generatedIdeaId,
    slotStartAt: new Date(slotStartAtIso),
    slotEndAt: new Date(slotEndAtIso),
  });
}
