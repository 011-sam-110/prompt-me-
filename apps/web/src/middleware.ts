// Route protection for M2's onboarding gate. Two independent
// implementations behind one switch: real Clerk middleware when
// NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY/CLERK_SECRET_KEY are set, or a
// cookie-only dev stand-in otherwise (lib/auth/config.ts,
// lib/auth/dev-session.ts). `clerkMiddleware(...)`'s factory call is safe
// to make unconditionally at module scope — it only reads/validates keys
// inside the handler it returns, which this file only ever invokes from
// the isClerkConfigured() branch — so a keyless dev/test run never
// actually exercises the Clerk SDK.
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { isClerkConfigured } from "@/lib/auth/config";
import { DEV_SESSION_COOKIE } from "@/lib/auth/dev-session";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks(.*)",
]);

const withClerk = clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

function devModeMiddleware(req: NextRequest): NextResponse {
  if (isPublicRoute(req)) {
    return NextResponse.next();
  }
  if (req.cookies.has(DEV_SESSION_COOKIE)) {
    return NextResponse.next();
  }
  const signIn = new URL("/sign-in", req.url);
  signIn.searchParams.set("redirect_url", req.nextUrl.pathname);
  return NextResponse.redirect(signIn);
}

export default function middleware(req: NextRequest, event: NextFetchEvent) {
  if (isClerkConfigured()) {
    return withClerk(req, event);
  }
  return devModeMiddleware(req);
}

export const config = {
  matcher: [
    // Everything except Next internals and common static assets.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
