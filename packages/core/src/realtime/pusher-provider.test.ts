// Unit tests for our own request-construction/auth-signing — not a claim
// that this matches Pusher's real service (pusher-provider.ts's own top
// comment: no live credentials exist yet to verify that against). `fetch`
// is stubbed throughout, same style as ../places/google-places-provider.test.ts.
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash, createHmac } from "node:crypto";
import { PusherRealtimeProvider } from "./pusher-provider";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PusherRealtimeProvider.trigger", () => {
  it("POSTs to the cluster-derived events endpoint with a correctly-signed request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new PusherRealtimeProvider({ appId: "1234", key: "the-key", secret: "the-secret", cluster: "eu" });
    await provider.trigger("chat-window-abc", "chat-message", { hello: "world" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const parsed = new URL(url);

    expect(parsed.origin).toBe("https://api-eu.pusher.com");
    expect(parsed.pathname).toBe("/apps/1234/events");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");

    const body = init.body as string;
    expect(JSON.parse(body)).toEqual({
      name: "chat-message",
      channels: ["chat-window-abc"],
      data: JSON.stringify({ hello: "world" }),
    });

    expect(parsed.searchParams.get("auth_key")).toBe("the-key");
    expect(parsed.searchParams.get("auth_version")).toBe("1.0");
    expect(parsed.searchParams.get("body_md5")).toBe(createHash("md5").update(body).digest("hex"));

    // Re-derive the expected signature the same way the implementation
    // does (sorted params, minus auth_signature itself) and confirm it
    // matches — proving the HMAC actually covers what Pusher's REST API
    // documents it must, not just that *some* signature was sent.
    const paramsWithoutSignature = new URLSearchParams(parsed.search);
    paramsWithoutSignature.delete("auth_signature");
    paramsWithoutSignature.sort();
    const stringToSign = ["POST", "/apps/1234/events", paramsWithoutSignature.toString()].join("\n");
    const expectedSignature = createHmac("sha256", "the-secret").update(stringToSign).digest("hex");
    expect(parsed.searchParams.get("auth_signature")).toBe(expectedSignature);
  });

  it("respects a baseUrl override", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new PusherRealtimeProvider({
      appId: "1",
      key: "k",
      secret: "s",
      cluster: "eu",
      baseUrl: "https://proxy.example.test",
    });
    await provider.trigger("c", "e", {});

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url.startsWith("https://proxy.example.test/apps/1/events")).toBe(true);
  });

  it("throws on a non-ok HTTP response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 401, statusText: "Unauthorized" })));
    const provider = new PusherRealtimeProvider({ appId: "1", key: "k", secret: "bad-secret", cluster: "eu" });
    await expect(provider.trigger("c", "e", {})).rejects.toThrow(/401/);
  });
});
