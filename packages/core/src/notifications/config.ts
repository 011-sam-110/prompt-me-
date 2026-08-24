// Whether real Resend credentials are configured. Mirrors
// ../realtime/config.ts's isPusherConfigured() exactly, applied to Resend:
// both an API key AND a from-address are required to construct a working
// ResendNotificationProvider (resend-provider.ts) — Resend rejects a send
// with no `from`, and there's no sensible default address to fall back to
// (unlike ../moderation/config.ts's OPENAI_API_BASE_URL, which has a real
// production default), so a partially-filled-in .env still falls back to
// the dev-mock rather than constructing a provider that would fail on its
// first real send() call.
export function isResendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
}
