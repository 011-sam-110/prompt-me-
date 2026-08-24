"use server";
// Server actions backing the review-queue UI
// (components/moderation/moderation-queue.tsx) — mirrors
// lib/date-proposals/actions.ts's shape exactly: resolve who's signed in,
// gate on isAuthorizedReviewer (reviewer-access.ts), then delegate to
// review-flag.ts's composition.
import { redirect } from "next/navigation";
import type { ModerationFlag } from "@prompt-me/db";
import { getAppDb } from "@/lib/db";
import { getAuthSession } from "@/lib/auth/session";
import { isAuthorizedReviewer } from "./reviewer-access";
import { approveModerationFlag, takeDownModerationFlag } from "./review-flag";

/**
 * No `ensureUserForClerkId` call here, unlike most other actions.ts files
 * in this app (lib/date-proposals/actions.ts, etc.): a review action isn't
 * attributed to a `users` row anywhere in this schema
 * (moderation-flags.ts has no `reviewed_by` column — a real "which
 * reviewer did this" audit trail is a fair follow-up once reviewer
 * accounts are a real concept, reviewer-access.ts's own comment), so
 * there's nothing here that actually needs the signed-in Clerk id turned
 * into a `users` row first.
 */
async function requireReviewer() {
  const { clerkId } = await getAuthSession();
  if (!clerkId) {
    redirect("/sign-in");
  }
  if (!isAuthorizedReviewer(clerkId)) {
    // Same "redirect away, don't confirm the route exists" shape an
    // unauthorized date-proposal/chat access attempt gets elsewhere in
    // this app.
    redirect("/feed");
  }
  return getAppDb();
}

export async function submitApproveModerationFlag(flagId: string): Promise<ModerationFlag> {
  const db = await requireReviewer();
  return approveModerationFlag(db, flagId);
}

export async function submitTakeDownModerationFlag(flagId: string): Promise<ModerationFlag> {
  const db = await requireReviewer();
  return takeDownModerationFlag(db, flagId);
}
