// Dev-mode session cookie helpers. Only meaningful when isClerkConfigured()
// is false — see config.ts.
export const DEV_SESSION_COOKIE = "prompt_me_dev_clerk_id";

/**
 * A fake "Clerk account id" for dev-mode sign-up. Prefixed distinctly from
 * real Clerk ids (which always start with "user_") so a dev session can
 * never be mistaken for — or collide with — a real one once Clerk is wired
 * up for real.
 */
export function newDevClerkId(): string {
  return `dev_${crypto.randomUUID()}`;
}
