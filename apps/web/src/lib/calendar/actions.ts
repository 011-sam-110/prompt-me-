"use server";
// Server actions backing the calendar UI (components/calendar/*) — mirrors
// lib/rewatch/actions.ts's / lib/location/actions.ts's shape exactly:
// resolve who's signed in, ensure their `users` row exists, then delegate
// to the composition point. `startAt`/`endAt` cross the client/server
// boundary as ISO strings (a Server Action's arguments are serialized) and
// are parsed into `Date`s here, before ever reaching manage-slots.ts.
import { redirect } from "next/navigation";
import { ensureUserForClerkId, type CalendarSlot } from "@prompt-me/db";
import { getAppDb } from "@/lib/db";
import { getAuthSession } from "@/lib/auth/session";
import { addCalendarSlot, removeCalendarSlot } from "./manage-slots";

export interface SubmitAddCalendarSlotResult {
  slot: CalendarSlot;
}

export async function submitAddCalendarSlot(
  startAtIso: string,
  endAtIso: string,
  status: CalendarSlot["status"],
): Promise<SubmitAddCalendarSlotResult> {
  const { clerkId } = await getAuthSession();
  if (!clerkId) {
    redirect("/sign-in");
  }

  const db = await getAppDb();
  const user = await ensureUserForClerkId(db, clerkId);
  const slot = await addCalendarSlot(db, user.id, {
    startAt: new Date(startAtIso),
    endAt: new Date(endAtIso),
    status,
  });
  return { slot };
}

export async function submitRemoveCalendarSlot(slotId: string): Promise<void> {
  const { clerkId } = await getAuthSession();
  if (!clerkId) {
    redirect("/sign-in");
  }

  const db = await getAppDb();
  const user = await ensureUserForClerkId(db, clerkId);
  await removeCalendarSlot(db, user.id, slotId);
}
