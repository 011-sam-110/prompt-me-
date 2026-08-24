// Lists the signed-in user's active matches (queries/matches.ts's
// getActiveMatchesForUser — "immediately removing the pair from the
// planning UI" the instant one's Escaped, since this query simply stops
// returning it), each linking to that match's calendar
// (ROADMAP.md M9's calendar half). No display-name field exists anywhere
// in this schema yet (schema/users.ts's own header comment: "Profile
// basics like name/email live in Clerk, not here" — and nothing here reads
// Clerk's profile API), so each match is labeled by when it matched rather
// than a name.
import { redirect } from "next/navigation";
import Link from "next/link";
import { getActiveMatchesForUser } from "@prompt-me/db";
import { getAppDb } from "@/lib/db";
import { getAuthSession } from "@/lib/auth/session";
import { resolveOnboarding } from "@/lib/auth/onboarding";

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
});

export default async function MatchesPage() {
  const { clerkId } = await getAuthSession();
  if (!clerkId) {
    redirect("/sign-in");
  }

  const db = await getAppDb();
  const { state, user } = await resolveOnboarding(db, clerkId);
  if (state !== "active") {
    redirect("/onboarding");
  }

  const matches = await getActiveMatchesForUser(db, user.id);

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-4 px-6 py-16">
      <h1 className="text-2xl font-semibold">Your matches</h1>

      {matches.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No matches yet — keep going through the feed.
        </p>
      ) : (
        <ul className="flex flex-col gap-2" data-testid="matches-list">
          {matches.map((match) => (
            <li key={match.id}>
              <Link
                href={`/matches/${match.id}/calendar`}
                data-match-id={match.id}
                className="block rounded-lg border border-border px-4 py-3 text-sm hover:bg-muted"
              >
                <span className="font-medium">Matched {dateFormatter.format(match.matchedAt)}</span>
                <span className="block text-xs text-muted-foreground">Plan a date &rarr;</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
