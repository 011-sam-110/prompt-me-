// Barrel for @prompt-me/core's notification-sending domain
// (ENGINEERING_SPEC.md §14, ROADMAP.md M13). Same shape as ../realtime's
// own barrel: types + the dev-mock's test-only read/reset hooks + the real
// provider + get-provider.ts's selector. Composed with @prompt-me/db by
// apps/web/src/lib/notifications/ (recipient-email resolution + the four
// trigger points).
export type {
  NotificationType,
  NotificationEvent,
  NewMatchNotificationEvent,
  NewDateProposalNotificationEvent,
  DateProposalAcceptedNotificationEvent,
  ChatWindowOpeningSoonNotificationEvent,
  NotificationProvider,
} from "./types";
export { renderNotificationEmail, type RenderedNotificationEmail } from "./templates";
export { isResendConfigured } from "./config";
export {
  DevMockNotificationProvider,
  getDevMockSentNotifications,
  clearDevMockSentNotifications,
  type DevMockSentNotification,
} from "./dev-mock-provider";
export { DEFAULT_RESEND_API_BASE_URL, ResendNotificationProvider } from "./resend-provider";
export { getNotificationProvider } from "./get-provider";
