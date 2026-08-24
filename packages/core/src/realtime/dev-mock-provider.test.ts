import { describe, expect, it, vi } from "vitest";
import { DevMockRealtimeProvider, subscribeDevMockChannel, type DevMockRealtimeEvent } from "./dev-mock-provider";

describe("DevMockRealtimeProvider / subscribeDevMockChannel", () => {
  it("delivers a triggered event to a subscriber on the same channel", async () => {
    const received: DevMockRealtimeEvent[] = [];
    const unsubscribe = subscribeDevMockChannel("chat-window-abc", (evt) => received.push(evt));

    const provider = new DevMockRealtimeProvider();
    await provider.trigger("chat-window-abc", "chat-message", { body: "hi" });

    expect(received).toEqual([{ event: "chat-message", payload: { body: "hi" } }]);
    unsubscribe();
  });

  it("never delivers to a subscriber on a different channel", async () => {
    const received: DevMockRealtimeEvent[] = [];
    const unsubscribe = subscribeDevMockChannel("chat-window-mine", (evt) => received.push(evt));

    const provider = new DevMockRealtimeProvider();
    await provider.trigger("chat-window-someone-elses", "chat-message", { body: "not for you" });

    expect(received).toEqual([]);
    unsubscribe();
  });

  it("delivers one trigger to every current subscriber on that channel", async () => {
    const listenerA = vi.fn();
    const listenerB = vi.fn();
    const unsubscribeA = subscribeDevMockChannel("chat-window-fanout", listenerA);
    const unsubscribeB = subscribeDevMockChannel("chat-window-fanout", listenerB);

    await new DevMockRealtimeProvider().trigger("chat-window-fanout", "chat-message", { n: 1 });

    expect(listenerA).toHaveBeenCalledTimes(1);
    expect(listenerB).toHaveBeenCalledTimes(1);
    unsubscribeA();
    unsubscribeB();
  });

  it("unsubscribe stops further delivery without affecting other subscribers", async () => {
    const stillListening = vi.fn();
    const stopped = vi.fn();
    const unsubscribeStopped = subscribeDevMockChannel("chat-window-unsub", stopped);
    const unsubscribeStillListening = subscribeDevMockChannel("chat-window-unsub", stillListening);

    unsubscribeStopped();
    await new DevMockRealtimeProvider().trigger("chat-window-unsub", "chat-message", { n: 1 });

    expect(stopped).not.toHaveBeenCalled();
    expect(stillListening).toHaveBeenCalledTimes(1);
    unsubscribeStillListening();
  });

  it("shares delivery across two independent module instantiations (the exact bug this file's own header comment describes: Next.js dev mode compiling send-message.ts's Route Handler and the SSE subscribe route into separate module graphs, each getting its own copy of a plain module-scope EventEmitter — globalThis is what makes trigger() from one and subscribeDevMockChannel() from the other actually talk to each other)", async () => {
    vi.resetModules();
    const moduleInstanceA = await import("./dev-mock-provider");

    vi.resetModules();
    const moduleInstanceB = await import("./dev-mock-provider");

    // vi.resetModules() forces a fresh top-level module evaluation for each
    // import below — proving these are genuinely two separate module
    // instantiations, not vitest's cache handing back the same object (the
    // one thing a plain `const bus = new EventEmitter()` would NOT survive,
    // and globalThis does).
    expect(moduleInstanceA).not.toBe(moduleInstanceB);

    const received: DevMockRealtimeEvent[] = [];
    const unsubscribe = moduleInstanceB.subscribeDevMockChannel("chat-window-cross-module", (evt) =>
      received.push(evt),
    );

    await new moduleInstanceA.DevMockRealtimeProvider().trigger("chat-window-cross-module", "chat-message", {
      body: "sent from module instance A",
    });

    expect(received).toEqual([{ event: "chat-message", payload: { body: "sent from module instance A" } }]);
    unsubscribe();
  });
});
