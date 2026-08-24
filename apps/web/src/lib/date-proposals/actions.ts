"use server";
// Server actions backing the date-proposal UI (components/date-proposals/*)
// — mirrors lib/calendar/actions.ts's / lib/rewatch/actions.ts's shape
// exactly: resolve who's signed in, ensure their `users` row exists, then
// delegate to the relevant composition point. Date/time values cross the
// client/server boundary as ISO strings (a Server Action's arguments are
// serialized) and are parsed into `Date`s here, before ever reaching
// propose.ts — same convention lib/calendar/actions.ts's own comment
// documents for calendar slots.
import { redirect } from "next/navigation";
import { ensureUserForClerkId, type DateProposal } from "@prompt-me/db";
import type { Place } from "@prompt-me/core";
import { getAppDb } from "@/lib/db";
import { getAuthSession } from "@/lib/auth/session";
import { proposeDate } from "./propose";
import { acceptDate, declineDate } from "./respond";
import { setDateVenue } from "./set-venue";
import { searchVenues as searchVenuesImpl } from "./search-venues";

async function requireSignedInUser() {
  const { clerkId } = await getAuthSession();
  if (!clerkId) {
    redirect("/sign-in");
  }
  const db = await getAppDb();
  const user = await ensureUserForClerkId(db, clerkId);
  return { db, user };
}

export async function submitProposeDate(
  matchId: string,
  ideaText: string,
  slotStartAtIso: string,
  slotEndAtIso: string,
): Promise<DateProposal> {
  const { db, user } = await requireSignedInUser();
  return proposeDate(db, matchId, user.id, {
    ideaText,
    slotStartAt: new Date(slotStartAtIso),
    slotEndAt: new Date(slotEndAtIso),
  });
}

export async function submitAcceptDate(proposalId: string): Promise<DateProposal> {
  const { db, user } = await requireSignedInUser();
  return acceptDate(db, proposalId, user.id);
}

export async function submitDeclineDate(proposalId: string): Promise<DateProposal> {
  const { db, user } = await requireSignedInUser();
  return declineDate(db, proposalId, user.id);
}

export async function submitSetDateVenue(proposalId: string, venuePlaceId: string): Promise<DateProposal> {
  const { db, user } = await requireSignedInUser();
  return setDateVenue(db, proposalId, user.id, venuePlaceId);
}

/**
 * No signed-in-user requirement here — mirrors search-venues.ts's own
 * comment: this reveals nothing about any match or user, only the active
 * places provider's public place data, so it's safe to expose to any
 * caller of the server action, signed in or not.
 */
export async function submitSearchVenues(query: string): Promise<Place[]> {
  return searchVenuesImpl(query);
}
