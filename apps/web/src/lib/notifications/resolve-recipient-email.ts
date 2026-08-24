// ENGINEERING_SPEC.md §14 needs an actual email address to send to, but
// email/name live in Clerk (ENGINEERING_SPEC §1: "Profile basics like
// name/email live in Clerk, not here" — packages/db/src/schema/users.ts's
// own header comment), never in our own `users` table. This is the one
// place that gap gets closed, mirroring lib/auth/session.ts's own
// "isClerkConfigured() ? real Clerk : dev stub" shape and its dynamic
// `await import("@clerk/nextjs/server")` (so this file — and everything
// that imports it — still loads with zero real Clerk credentials, same as
// every other adapter in this codebase).
import { isClerkConfigured } from "../auth/config";

/** Real Clerk accounts always look like "user_...". Dev-mode ones minted
 * by lib/auth/dev-session.ts's newDevClerkId always start with "dev_" —
 * this reserved TLD (RFC 2606: .invalid is guaranteed to never resolve to
 * a real mailbox) makes it unmistakable, even from a raw log line, that an
 * address came from this fallback rather than a real account. */
const DEV_MOCK_EMAIL_DOMAIN = "dev.prompt-me.invalid";

export class RecipientEmailNotFoundError extends Error {
  constructor(clerkId: string) {
    super(`resolveRecipientEmail: Clerk account ${clerkId} has no email address on file`);
    this.name = "RecipientEmailNotFoundError";
  }
}

/**
 * Resolves a `users.clerk_id` to the address a notification should be sent
 * to. Real Clerk lookup (the account's primary email, falling back to its
 * first email if somehow no primary is set) once Clerk is actually
 * configured; a deterministic synthetic `.invalid` address otherwise — so
 * every notification composition point in this directory works with zero
 * real Clerk credentials, the same "missing credentials never block a
 * build" guarantee every other adapter in this repo gives (CLAUDE.md).
 *
 * No test in this repo ever sets CLERK_SECRET_KEY/NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
 * (lib/auth/config.test.ts's own afterEach restores them), so the real
 * branch below is never reached by the test suite — same "never actually
 * exercised without a real key" caveat this codebase's other real-provider
 * files (didit-provider.ts, omni-moderation-provider.ts) already carry.
 */
export async function resolveRecipientEmail(clerkId: string): Promise<string> {
  if (!isClerkConfigured()) {
    return `${clerkId}@${DEV_MOCK_EMAIL_DOMAIN}`;
  }

  const { clerkClient } = await import("@clerk/nextjs/server");
  const client = await clerkClient();
  const user = await client.users.getUser(clerkId);

  const primary = user.emailAddresses.find((address) => address.id === user.primaryEmailAddressId);
  const email = primary?.emailAddress ?? user.emailAddresses[0]?.emailAddress;
  if (!email) {
    throw new RecipientEmailNotFoundError(clerkId);
  }
  return email;
}
