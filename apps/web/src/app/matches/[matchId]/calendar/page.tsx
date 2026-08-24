// ROADMAP.md M9's calendar half: "Busy/available calendar UI per user,
// visible to an active match once planning starts." Server component reads
// through lib/calendar/get-match-calendar.ts, which enforces both the
// participant guard and the active-match gate before either side's slots
// are ever fetched (that module's own header comment explains why
// `matches.status = "active"` is today's stand-in for "planning has
// started" — there's no finer persisted sub-state yet). The signed-in
// viewer's own calendar renders editable (OwnCalendarEditor); the matched
// partner's renders read-only (CalendarSlotList with no onDelete).
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getAppDb } from "@/lib/db";
import { getAuthSession } from "@/lib/auth/session";
import { resolveOnboarding } from "@/lib/auth/onboarding";
import {
  CalendarMatchAccessError,
  CalendarMatchNotActiveError,
  getMatchCalendar,
} from "@/lib/calendar/get-match-calendar";
import { OwnCalendarEditor } from "@/components/calendar/own-calendar-editor";
import { CalendarSlotList } from "@/components/calendar/calendar-slot-list";

export default async function MatchCalendarPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = await params;
  const { clerkId } = await getAuthSession();
  if (!clerkId) {
    redirect("/sign-in");
  }

  const db = await getAppDb();
  const { state, user } = await resolveOnboarding(db, clerkId);
  if (state !== "active") {
    redirect("/onboarding");
  }

  let calendar;
  try {
    calendar = await getMatchCalendar(db, matchId, user.id);
  } catch (error) {
    if (error instanceof CalendarMatchAccessError) {
      notFound();
    }
    if (error instanceof CalendarMatchNotActiveError) {
      // Escaped mid-visit — no messaging exists in this app to say why, so
      // land back on the matches list, where this pair no longer appears
      // (getActiveMatchesForUser already excludes it).
      redirect("/matches");
    }
    throw error;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-6 px-6 py-16">
      <div>
        <Link href="/matches" className="text-xs text-muted-foreground hover:underline">
          &larr; Your matches
        </Link>
        <h1 className="text-2xl font-semibold">Plan a date</h1>
        <p className="text-sm text-muted-foreground">
          Add the times you&apos;re free or busy — your match can see this calendar, and you can see theirs.
        </p>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">Your calendar</h2>
        <OwnCalendarEditor initialSlots={calendar.ownSlots} />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">Their calendar</h2>
        <CalendarSlotList
          slots={calendar.otherSlots}
          emptyLabel="They haven't added any times yet."
          testId="partner-calendar-slots"
        />
      </section>
    </main>
  );
}
