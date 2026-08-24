// Pure channel/event naming shared between the server (trigger, via
// ../realtime's active provider) and the browser (subscribe, via a real
// Pusher client or the dev-mock SSE route) halves of realtime chat
// delivery — ENGINEERING_SPEC §11. Lives alongside window.ts rather than
// under ../realtime because it's naming specific to ONE window's own
// messages, not a general realtime concern; ../realtime holds the actual
// provider/transport (Pusher vs the dev-mock in-memory bus). Both
// apps/web's components/chat/chat-window.tsx (client) and
// lib/chat/send-message.ts (server) import these two constants so they can
// never independently drift on what "this window's messages" means as a
// channel/event name.
export const CHAT_MESSAGE_EVENT = "chat-message";

export function chatWindowChannelName(chatWindowId: string): string {
  return `chat-window-${chatWindowId}`;
}
