// Whether real Pusher credentials are configured. Mirrors
// ../places/config.ts's isGooglePlacesConfigured() / ../verification/config.ts's
// isDiditConfigured() exactly, applied to Pusher — all four of
// PUSHER_APP_ID/PUSHER_KEY/PUSHER_SECRET/PUSHER_CLUSTER are required to
// construct a working PusherRealtimeProvider (pusher-provider.ts), so all
// four must be set for this to report true; a partially-filled-in .env
// still falls back to the dev-mock rather than constructing a provider
// that would fail on its first real trigger() call.
export function isPusherConfigured(): boolean {
  return Boolean(
    process.env.PUSHER_APP_ID && process.env.PUSHER_KEY && process.env.PUSHER_SECRET && process.env.PUSHER_CLUSTER,
  );
}
