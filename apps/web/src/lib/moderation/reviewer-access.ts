// Who may open the internal moderation review queue (app/internal/
// moderation, ROADMAP.md M12). No staff/role table exists anywhere in this
// schema yet — packages/db/src/schema/users.ts's own header comment: that
// table holds only the app-specific state layered on a Clerk account, and
// building a real "who are the reviewers, how are they added/removed"
// role system is a genuine product decision, out of scope for "a minimal
// internal review queue UI."
//
// The engineering default that unblocks this milestone without one: an
// allowlist of Clerk ids read from INTERNAL_REVIEWER_CLERK_IDS
// (comma-separated) — the same "credential-shaped config an adapter
// reads, with a documented fallback when it's unset" shape every other
// integration in this codebase uses (CLAUDE.md: "missing credentials
// never block a build"). Unset — today's default, since ROADMAP.md's
// *Needs from Sampo* has no entry for this yet — falls back to "any
// signed-in user may open it," matching how every other adapter in this
// repo defaults to its dev-mock rather than refusing to run at all; this
// route is simply never linked from anywhere a regular user would find
// it (no nav entry points here). A real reviewer role is a fair follow-up
// once staff accounts exist to assign it to.
function reviewerAllowlist(): string[] | null {
  const raw = process.env.INTERNAL_REVIEWER_CLERK_IDS;
  if (!raw || raw.trim().length === 0) {
    return null;
  }
  return raw
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

export function isAuthorizedReviewer(clerkId: string): boolean {
  const allowlist = reviewerAllowlist();
  if (allowlist === null) {
    return true;
  }
  return allowlist.includes(clerkId);
}
