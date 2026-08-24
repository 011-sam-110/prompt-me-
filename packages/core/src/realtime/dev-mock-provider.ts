// ROADMAP.md M11's realtime half: "an adapter with a dev-mock fallback
// (e.g. an in-memory pub/sub substitute) that still works for tests
// without real Pusher keys." Same "used automatically when no real
// credentials are configured" shape as every other adapter in this
// package, but the mechanism is different from a dev-mock HTTP/data
// fixture (places, verification, moderation, date-ideas): there's no
// request/response to fake here, only a fire-and-listen pub/sub — a single
// process-wide EventEmitter stands in for the Pusher service itself.
//
// This works for BOTH halves of the real deployment because both run
// inside the same Next.js dev-server Node process: apps/web/src/lib/chat/send-message.ts's
// `trigger()` call (the "server publishes" half, same as a real
// PusherRealtimeProvider) and apps/web/src/app/api/chat/subscribe/[chatWindowId]/route.ts's
// `subscribeDevMockChannel()` call (an SSE stream standing in for the
// browser's own long-lived Pusher websocket connection, since there's no
// external realtime service to connect to in dev-mock mode — a real
// deployment's browser and server are genuinely different processes/hosts,
// which is exactly why ENGINEERING_SPEC §1 says Vercel functions can't do
// this themselves and a managed pub/sub layer is needed at all).
//
// The bus lives on `globalThis`, not a plain module-scope variable — the
// exact bug packages/db/src/dev-client.ts's own header comment documents
// finding "the hard way building M3": Next.js dev mode compiles a Route
// Handler (send-message.ts's own POST route) and a *different* Route
// Handler (the SSE subscribe route) into separate module graphs, each
// getting its own copy of this module's top-level scope. A plain `const
// bus = new EventEmitter()` meant trigger() and subscribeDevMockChannel()
// were silently talking to two different EventEmitter objects — the
// trigger "succeeded," the subscriber just never heard it, which is
// exactly the class of bug this milestone's own Playwright spec caught (a
// message sent by one party never arriving on the other's already-open
// page). `globalThis` is the one thing actually shared across every module
// instantiation in the same Node process — same fix, same reasoning,
// applied here instead of to a cached db connection.
import { EventEmitter } from "node:events";
import type { RealtimeProvider } from "./types";

export interface DevMockRealtimeEvent {
  event: string;
  payload: unknown;
}

const GLOBAL_KEY = Symbol.for("prompt-me.packages/core.devMockRealtimeBus");

interface DevMockRealtimeGlobal {
  [GLOBAL_KEY]?: EventEmitter;
}

function globalBus(): EventEmitter {
  const store = globalThis as DevMockRealtimeGlobal;
  if (!store[GLOBAL_KEY]) {
    const emitter = new EventEmitter();
    // Unlimited listeners: every open chat page (however many browser
    // tabs/contexts a dev or Playwright run has connected via the SSE
    // route) adds one listener per channel, and Node's default cap of 10
    // exists to catch leaks, not to limit legitimate concurrent chat
    // viewers.
    emitter.setMaxListeners(0);
    store[GLOBAL_KEY] = emitter;
  }
  return store[GLOBAL_KEY];
}

const bus = globalBus();

/**
 * Subscribes `listener` to every event triggered on `channel`. Returns an
 * unsubscribe function — the SSE route calls it when the client disconnects
 * (the request's AbortSignal firing), so a closed browser tab doesn't leak
 * a listener forever.
 */
export function subscribeDevMockChannel(
  channel: string,
  listener: (event: DevMockRealtimeEvent) => void,
): () => void {
  bus.on(channel, listener);
  return () => {
    bus.off(channel, listener);
  };
}

export class DevMockRealtimeProvider implements RealtimeProvider {
  async trigger(channel: string, event: string, payload: unknown): Promise<void> {
    bus.emit(channel, { event, payload });
  }
}
