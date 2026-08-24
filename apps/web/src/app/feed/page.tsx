// Placeholder — the real discovery feed ships in M6. This page only
// proves the M2 onboarding gate: it's unreachable until
// `verification_status = passed`.
import { redirect } from "next/navigation";
import { getAppDb } from "@/lib/db";
import { getAuthSession } from "@/lib/auth/session";
import { resolveOnboarding } from "@/lib/auth/onboarding";

export default async function FeedPage() {
  const { clerkId } = await getAuthSession();
  if (!clerkId) {
    redirect("/sign-in");
  }

  const db = await getAppDb();
  const { state, user } = await resolveOnboarding(db, clerkId);

  if (state !== "active") {
    redirect("/onboarding");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <h1 className="text-2xl font-semibold">You&apos;re verified</h1>
      <p className="text-muted-foreground">
        The real discovery feed ships in M6. Reaching this page at all
        proves the M2 onboarding gate opened once your account&apos;s
        verification status flipped to passed.
      </p>
      <p className="text-xs text-muted-foreground">Signed in as {user.clerkId}</p>
    </main>
  );
}
