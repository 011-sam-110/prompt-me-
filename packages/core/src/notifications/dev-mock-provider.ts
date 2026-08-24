// Dev fallback for NotificationProvider — used automatically whenever no
// real Resend credentials are configured (see get-provider.ts), which is
// the case for the WHOLE test suite today (no test ever sets
// RESEND_API_KEY/RESEND_FROM_EMAIL) and for the whole repo until Sampo
// supplies a real key (ROADMAP.md → Needs from Sampo). This is the one
// notification-sending path a test run may ever exercise — CLAUDE.md's "no
// synthetic output presented as real work" rule, applied here as "no real
// email may ever leave a test run": there is no code path in this package
// that reaches ResendNotificationProvider without both env vars explicitly
// set, and no test in this repo sets them (packages/core/src/notifications/get-provider.test.ts
// only ever sets/unsets them inside its own afterEach-restored sandbox).
//
// Genuinely functional rather than a no-op, same rationale as
// ../storage/mock-clip-storage-adapter.ts's own header comment: it doesn't
// send a real email, but it does render the real template
// (templates.ts — the exact copy a real send would use) and record the
// result somewhere a test can read back, rather than just returning
// successfully having done nothing observable.
//
// The recorded log lives on `globalThis`, not a plain module-scope array —
// the same defensive reason ../realtime/dev-mock-provider.ts's own header
// comment gives for its EventEmitter: Next.js dev mode can compile the
// route handler that TRIGGERS a notification (e.g. the propose-date server
// action) and the route/test that later READS the mock log back into
// separate module graphs, each with its own copy of a plain top-level
// `const`. `globalThis` is the one thing actually shared across every
// module instantiation in the same Node process.
import { renderNotificationEmail } from "./templates";
import type { NotificationEvent, NotificationProvider } from "./types";

export interface DevMockSentNotification {
  event: NotificationEvent;
  subject: string;
  text: string;
  sentAt: Date;
}

const GLOBAL_KEY = Symbol.for("prompt-me.packages/core.devMockNotificationLog");

interface DevMockNotificationGlobal {
  [GLOBAL_KEY]?: DevMockSentNotification[];
}

function log(): DevMockSentNotification[] {
  const store = globalThis as DevMockNotificationGlobal;
  if (!store[GLOBAL_KEY]) {
    store[GLOBAL_KEY] = [];
  }
  return store[GLOBAL_KEY];
}

export class DevMockNotificationProvider implements NotificationProvider {
  async send(event: NotificationEvent): Promise<void> {
    const { subject, text } = renderNotificationEmail(event);
    log().push({ event, subject, text, sentAt: new Date() });
    // A real, observable side effect (same spirit as the storage mock
    // writing real bytes to disk) — a dev running locally with no Resend
    // key can watch these lines to confirm notifications are firing at
    // all, without a real inbox to check.
    console.info(
      `[dev-mock email] to=${event.recipientEmail} type=${event.type} subject=${JSON.stringify(subject)}`,
    );
  }
}

/**
 * Test/dev-only escape hatch to read back every notification sent through
 * DevMockNotificationProvider since the process started (or since the last
 * clearDevMockSentNotifications() call) — what proves the mock is
 * genuinely functional rather than a silent no-op (see
 * dev-mock-provider.test.ts), and what apps/web's notify-*.test.ts files
 * assert against directly.
 */
export function getDevMockSentNotifications(): DevMockSentNotification[] {
  return [...log()];
}

/**
 * Resets the recorded log — call from a test's `beforeEach`/`afterEach` so
 * one test's sent notifications never leak into the next one's assertions.
 * Mirrors ../realtime's per-test unsubscribe discipline, applied to a log
 * instead of a pub/sub subscription.
 */
export function clearDevMockSentNotifications(): void {
  log().length = 0;
}
