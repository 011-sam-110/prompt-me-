// Dev-mode stand-in for Clerk's <SignIn />/<SignUp /> — rendered by both
// /sign-in and /sign-up when no real Clerk keys are configured (see
// lib/auth/config.ts). There's no real identity provider behind this: it
// mints a fake account id into a cookie (lib/auth/dev-actions.ts) so the
// rest of the M2 flow (users-row creation, onboarding gate) can be
// exercised end to end without any credentials.
import { devSignIn, devSignUp } from "@/lib/auth/dev-actions";
import { Button } from "@/components/ui/button";

export function DevSignIn() {
  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6 py-16">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Prompt Me</h1>
        <p className="text-sm text-muted-foreground">
          Dev-mode auth — no Clerk keys configured yet (ROADMAP.md &rarr;
          Needs from Sampo). Accounts created here are fake and local to
          this environment.
        </p>
      </div>

      <form action={devSignUp}>
        <Button type="submit" className="w-full">
          Create a dev account
        </Button>
      </form>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <div className="h-px flex-1 bg-border" />
        or
        <div className="h-px flex-1 bg-border" />
      </div>

      <form action={devSignIn} className="flex flex-col gap-2">
        <label htmlFor="clerkId" className="text-sm text-muted-foreground">
          Sign back in with a dev account id
        </label>
        <input
          id="clerkId"
          name="clerkId"
          placeholder="dev_..."
          autoComplete="off"
          className="h-9 rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <Button type="submit" variant="outline" className="w-full">
          Sign in
        </Button>
      </form>
    </div>
  );
}
