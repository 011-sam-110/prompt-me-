// ROADMAP.md M2: "Onboarding shell routes an unverified user toward
// verification (M3) and blocks feed access until verification_status =
// passed." M3 hasn't been built yet — this page is the traffic-cop that
// will hand off to it, not the verification flow itself.
import { redirect } from "next/navigation";
import { getAppDb } from "@/lib/db";
import { getAuthSession } from "@/lib/auth/session";
import { resolveOnboarding } from "@/lib/auth/onboarding";

export default async function OnboardingPage() {
  const { clerkId } = await getAuthSession();
  if (!clerkId) {
    redirect("/sign-in");
  }

  const db = await getAppDb();
  const { state } = await resolveOnboarding(db, clerkId);

  if (state === "active") {
    redirect("/feed");
  }

  const failed = state === "verification_failed";

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <h1 className="text-2xl font-semibold">
        {failed ? "Verification didn't pass" : "One more step before your feed unlocks"}
      </h1>
      <p className="text-muted-foreground">
        {failed
          ? "Your last identity/age check didn't pass. You'll be able to retry it here."
          : "Prompt Me verifies every account's identity and age before you can see anyone else's profile."}
      </p>
      <div className="rounded-lg border border-dashed border-border px-6 py-8 text-sm text-muted-foreground">
        Identity &amp; age verification (M3) isn&apos;t built yet — this
        page is the gate that will hand off to it.
      </div>
    </main>
  );
}
