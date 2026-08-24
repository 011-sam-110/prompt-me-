"use client";
// Wraps the app in Clerk's provider only when real keys are configured.
// `clerkConfigured` is computed server-side (isClerkConfigured(), which
// can read CLERK_SECRET_KEY too) and passed down as a prop from
// layout.tsx, rather than re-derived here — a client component can only
// ever see NEXT_PUBLIC_ vars, so re-checking here would silently diverge
// from the real (server-side) truth if the two keys were ever set out of
// step with each other.
import { ClerkProvider } from "@clerk/nextjs";
import type { ReactNode } from "react";

export function AuthProvider({
  clerkConfigured,
  children,
}: {
  clerkConfigured: boolean;
  children: ReactNode;
}) {
  if (clerkConfigured) {
    return <ClerkProvider>{children}</ClerkProvider>;
  }
  return <>{children}</>;
}
