// Barrel for @prompt-me/core's realtime-transport adapter
// (ENGINEERING_SPEC.md §1/§11, ROADMAP.md M11's realtime half). Server-only
// — the real provider talks to Pusher's REST API with Node's own crypto,
// and even the dev-mock's bus is a Node EventEmitter, so nothing here is
// exposed through a client-safe subpath (contrast ../chat-windows/index.ts,
// which IS one, because chatWindowChannelName/CHAT_MESSAGE_EVENT are what a
// client component needs to subscribe with the real Pusher client SDK —
// see that file's own header comment).
export type { RealtimeProvider } from "./types";
export { isPusherConfigured } from "./config";
export { DevMockRealtimeProvider, subscribeDevMockChannel, type DevMockRealtimeEvent } from "./dev-mock-provider";
export { PusherRealtimeProvider, type PusherRealtimeProviderConfig } from "./pusher-provider";
export { getRealtimeProvider } from "./get-provider";
