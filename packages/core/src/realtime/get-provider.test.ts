import { afterEach, describe, expect, it } from "vitest";
import { DevMockRealtimeProvider } from "./dev-mock-provider";
import { PusherRealtimeProvider } from "./pusher-provider";
import { getRealtimeProvider } from "./get-provider";

const KEYS = ["PUSHER_APP_ID", "PUSHER_KEY", "PUSHER_SECRET", "PUSHER_CLUSTER"] as const;
const original = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

afterEach(() => {
  for (const k of KEYS) {
    if (original[k] === undefined) delete process.env[k];
    else process.env[k] = original[k];
  }
});

describe("getRealtimeProvider", () => {
  it("returns the dev-mock when no Pusher credentials are configured (this repo's default today)", () => {
    for (const k of KEYS) delete process.env[k];
    expect(getRealtimeProvider()).toBeInstanceOf(DevMockRealtimeProvider);
  });

  it("returns the dev-mock when only some of the four PUSHER_* vars are set", () => {
    delete process.env.PUSHER_APP_ID;
    process.env.PUSHER_KEY = "k";
    process.env.PUSHER_SECRET = "s";
    process.env.PUSHER_CLUSTER = "eu";
    expect(getRealtimeProvider()).toBeInstanceOf(DevMockRealtimeProvider);
  });

  it("returns the real Pusher provider once all four are configured", () => {
    process.env.PUSHER_APP_ID = "app-id";
    process.env.PUSHER_KEY = "key";
    process.env.PUSHER_SECRET = "secret";
    process.env.PUSHER_CLUSTER = "eu";
    expect(getRealtimeProvider()).toBeInstanceOf(PusherRealtimeProvider);
  });
});
