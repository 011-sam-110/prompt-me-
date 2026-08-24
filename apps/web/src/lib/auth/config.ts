// Whether real Clerk credentials are configured. When false, every auth
// surface (provider, sign-in/up pages, middleware, session lookup) falls
// back to an in-memory dev stub instead — CLAUDE.md's "missing credentials
// never block a build" rule, applied to auth: no real Clerk keys exist yet
// (ROADMAP.md -> Needs from Sampo, M2).
//
// Only ever called from server-side code (layout.tsx, middleware.ts,
// route handlers) — full `process.env` is available there regardless of
// the NEXT_PUBLIC_ prefix, so this is the single source of truth. Client
// components never call this directly; apps/web/src/lib/auth/provider.tsx
// receives the already-computed boolean as a prop from a server component
// instead of re-deriving it (see that file's comment).
export function isClerkConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY,
  );
}
