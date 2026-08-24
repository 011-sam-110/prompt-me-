// The actual "used automatically when no Pusher credentials are
// configured" switch — mirrors ../places/get-provider.ts /
// ../verification/get-provider.ts / ../moderation/get-provider.ts exactly,
// applied to realtime chat delivery.
import { isPusherConfigured } from "./config";
import { DevMockRealtimeProvider } from "./dev-mock-provider";
import { PusherRealtimeProvider } from "./pusher-provider";
import type { RealtimeProvider } from "./types";

/**
 * Returns the real Pusher-backed provider when all four PUSHER_* env vars
 * are set, otherwise the in-memory dev-mock. Callers never branch on
 * `isPusherConfigured()` themselves — this is the single place that
 * decision is made, so a send always has a working publish target with
 * zero credentials.
 */
export function getRealtimeProvider(): RealtimeProvider {
  if (isPusherConfigured()) {
    return new PusherRealtimeProvider({
      appId: process.env.PUSHER_APP_ID!,
      key: process.env.PUSHER_KEY!,
      secret: process.env.PUSHER_SECRET!,
      cluster: process.env.PUSHER_CLUSTER!,
    });
  }
  return new DevMockRealtimeProvider();
}
