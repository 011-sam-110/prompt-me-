// ENGINEERING_SPEC.md §1/§11: "Realtime: Pusher Channels, for the
// time-gated chat." Same adapter shape as every other external integration
// in this package (verification, moderation, transcription, storage,
// places, date-ideas) — one small interface, a dev-mock
// (dev-mock-provider.ts) and a real implementation (pusher-provider.ts),
// selected by get-provider.ts based on config.ts's isPusherConfigured().
export interface RealtimeProvider {
  /**
   * Publishes `payload` as `event` on `channel` to every current
   * subscriber. apps/web/src/lib/chat/send-message.ts is the only caller
   * today, right after a chat_messages row is persisted — see that file's
   * own comment for why this fires after the write, not before.
   */
  trigger(channel: string, event: string, payload: unknown): Promise<void>;
}
