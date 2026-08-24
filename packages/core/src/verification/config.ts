// Whether a real Didit API key is configured. Mirrors apps/web/src/lib/auth
// /config.ts's isClerkConfigured() (same "feature flag, real behind an env
// var" shape), applied to Didit — ROADMAP.md M3: "a real Didit
// implementation behind a feature flag."
//
// Lives here rather than in apps/web because packages/db's client.ts
// already sets the precedent of a non-web package reading process.env
// directly to decide real-vs-dev behavior (DATABASE_URL there, DIDIT_API_KEY
// here) — there's no NEXT_PUBLIC_ / client-vs-server split to worry about
// for a server-only secret like this one, unlike Clerk's publishable key.
export function isDiditConfigured(): boolean {
  return Boolean(process.env.DIDIT_API_KEY);
}
