"use server";
// Server actions backing the dev-mode sign-in/sign-up UI
// (components/auth/dev-sign-in.tsx). Only reachable when Clerk isn't
// configured — see assertDevMode below — so there's no path for these to
// run once real Clerk keys are in place.
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { isClerkConfigured } from "./config";
import { DEV_SESSION_COOKIE, newDevClerkId } from "./dev-session";

function assertDevMode(): void {
  if (isClerkConfigured()) {
    throw new Error("Dev auth actions are disabled once real Clerk keys are configured.");
  }
}

/** Dev-mode "sign up": mints a brand-new fake account id and signs into it. */
export async function devSignUp(): Promise<void> {
  assertDevMode();
  const clerkId = newDevClerkId();
  const store = await cookies();
  store.set(DEV_SESSION_COOKIE, clerkId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
  redirect("/onboarding");
}

/**
 * Dev-mode "sign in": re-attaches the session cookie to an existing dev
 * account id. There's no real identity store to look up in dev mode, so
 * the id has to be pasted back in from a previous sign-up.
 */
export async function devSignIn(formData: FormData): Promise<void> {
  assertDevMode();
  const clerkId = String(formData.get("clerkId") ?? "").trim();
  if (!clerkId) return;
  const store = await cookies();
  store.set(DEV_SESSION_COOKIE, clerkId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
  redirect("/onboarding");
}

export async function devSignOut(): Promise<void> {
  assertDevMode();
  const store = await cookies();
  store.delete(DEV_SESSION_COOKIE);
  redirect("/");
}
