// Unit tests for our own request/response handling — not a claim that
// this matches Resend's real API (see resend-provider.ts's top comment: no
// live key exists yet to verify that against). `fetch` is stubbed
// throughout, same style as ../moderation/omni-moderation-provider.test.ts.
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_RESEND_API_BASE_URL, ResendNotificationProvider } from "./resend-provider";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ResendNotificationProvider", () => {
  it("POSTs from/to/subject/text with Bearer auth to Resend's /emails endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { id: "email-1" }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new ResendNotificationProvider({
      apiKey: "re_secret_key",
      fromEmail: "notifications@prompt-me.app",
    });
    await provider.send({ type: "new_match", recipientEmail: "recipient@example.com", matchId: "match-1" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${DEFAULT_RESEND_API_BASE_URL}/emails`);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer re_secret_key");

    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.from).toBe("notifications@prompt-me.app");
    expect(body.to).toBe("recipient@example.com");
    expect(typeof body.subject).toBe("string");
    expect((body.subject as string).length).toBeGreaterThan(0);
    expect(typeof body.text).toBe("string");
  });

  it("respects a baseUrl override", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { id: "email-1" }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new ResendNotificationProvider({
      apiKey: "re_secret_key",
      fromEmail: "notifications@prompt-me.app",
      baseUrl: "https://resend.example.test",
    });
    await provider.send({ type: "new_match", recipientEmail: "recipient@example.com", matchId: "match-1" });

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://resend.example.test/emails");
  });

  it("throws on a non-ok response instead of silently swallowing the failure", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(422, { message: "invalid recipient" }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new ResendNotificationProvider({
      apiKey: "re_secret_key",
      fromEmail: "notifications@prompt-me.app",
    });

    await expect(
      provider.send({ type: "new_match", recipientEmail: "bad@example.com", matchId: "match-1" }),
    ).rejects.toThrow(/Resend email send failed/);
  });
});
