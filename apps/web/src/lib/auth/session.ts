// Server-side "who is signed in" lookup. Real Clerk when configured;
// otherwise the cookie-backed dev stub (dev-session.ts) — so the
// onboarding gate, its pages, and everything downstream of "who is the
// current user" work with zero real Clerk credentials.
import { cookies } from "next/headers";
import { isClerkConfigured } from "./config";
import { DEV_SESSION_COOKIE } from "./dev-session";

export interface AuthSession {
  /** The signed-in account's identifier — a real Clerk user id in
   * production, or a "dev_..." id in dev mode. Null when signed out. */
  clerkId: string | null;
}

export async function getAuthSession(): Promise<AuthSession> {
  if (isClerkConfigured()) {
    const { auth } = await import("@clerk/nextjs/server");
    const { userId } = await auth();
    return { clerkId: userId };
  }
  const store = await cookies();
  return { clerkId: store.get(DEV_SESSION_COOKIE)?.value ?? null };
}
