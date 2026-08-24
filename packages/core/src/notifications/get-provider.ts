// The actual "used automatically when no Resend credentials are
// configured" switch — mirrors ../realtime/get-provider.ts /
// ../moderation/get-provider.ts / ../verification/get-provider.ts exactly,
// applied to email notifications.
import { isResendConfigured } from "./config";
import { DevMockNotificationProvider } from "./dev-mock-provider";
import { ResendNotificationProvider } from "./resend-provider";
import type { NotificationProvider } from "./types";

/**
 * Returns the real Resend-backed provider when both RESEND_API_KEY and
 * RESEND_FROM_EMAIL are set, otherwise the dev-mock. Callers never branch
 * on `isResendConfigured()` themselves — this is the single place that
 * decision is made, so every notification trigger has a working send
 * target with zero credentials.
 */
export function getNotificationProvider(): NotificationProvider {
  if (isResendConfigured()) {
    return new ResendNotificationProvider({
      apiKey: process.env.RESEND_API_KEY!,
      fromEmail: process.env.RESEND_FROM_EMAIL!,
      baseUrl: process.env.RESEND_API_BASE_URL,
    });
  }
  return new DevMockNotificationProvider();
}
