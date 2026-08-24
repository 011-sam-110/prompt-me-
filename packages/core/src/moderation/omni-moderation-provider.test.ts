// Unit tests for our own request/response handling — not a claim that
// this matches OpenAI's real API (see omni-moderation-provider.ts's top
// comment: no live key exists yet to verify that against). `fetch` is
// stubbed throughout, same style as verification/didit-provider.test.ts.
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_OMNI_MODERATION_API_BASE_URL, OMNI_MODERATION_MODEL, OpenAiOmniModerationProvider } from "./omni-moderation-provider";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OpenAiOmniModerationProvider", () => {
  it("sends text input as a { type: text } item, model = omni-moderation-latest", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        results: [{ flagged: false, categories: { sexual: false }, category_scores: { sexual: 0.001 } }],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenAiOmniModerationProvider({ apiKey: "secret-key" });
    await provider.moderate({ type: "text", text: "hello" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${DEFAULT_OMNI_MODERATION_API_BASE_URL}/v1/moderations`);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret-key");
    expect(JSON.parse(init.body as string)).toEqual({
      model: OMNI_MODERATION_MODEL,
      input: [{ type: "text", text: "hello" }],
    });
  });

  it("sends image input as a { type: image_url } item", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        results: [{ flagged: false, categories: {}, category_scores: {} }],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenAiOmniModerationProvider({ apiKey: "k" });
    await provider.moderate({ type: "image", imageDataUrl: "data:image/jpeg;base64,ZmFrZQ==" });

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({
      model: OMNI_MODERATION_MODEL,
      input: [{ type: "image_url", image_url: { url: "data:image/jpeg;base64,ZmFrZQ==" } }],
    });
  });

  it("maps a clean response to flagged: false with per-category scores", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, {
          results: [
            {
              flagged: false,
              categories: { sexual: false, violence: false },
              category_scores: { sexual: 0.001, violence: 0.002 },
            },
          ],
        }),
      ),
    );
    const provider = new OpenAiOmniModerationProvider({ apiKey: "k" });
    const result = await provider.moderate({ type: "text", text: "hello" });
    expect(result.flagged).toBe(false);
    expect(result.categories).toEqual(
      expect.arrayContaining([
        { category: "sexual", flagged: false, score: 0.001 },
        { category: "violence", flagged: false, score: 0.002 },
      ]),
    );
  });

  it("maps a flagged response, surfacing which category tripped and its score", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, {
          results: [
            {
              flagged: true,
              categories: { sexual: false, "harassment/threatening": true },
              category_scores: { sexual: 0.01, "harassment/threatening": 0.91 },
            },
          ],
        }),
      ),
    );
    const provider = new OpenAiOmniModerationProvider({ apiKey: "k" });
    const result = await provider.moderate({ type: "text", text: "hello" });
    expect(result.flagged).toBe(true);
    expect(result.categories).toContainEqual({
      category: "harassment/threatening",
      flagged: true,
      score: 0.91,
    });
  });

  it("respects a baseUrl override", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, { results: [{ flagged: false, categories: {}, category_scores: {} }] }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const provider = new OpenAiOmniModerationProvider({ apiKey: "k", baseUrl: "https://proxy.example.test" });
    await provider.moderate({ type: "text", text: "hello" });
    expect(fetchMock.mock.calls[0]![0]).toBe("https://proxy.example.test/v1/moderations");
  });

  it("throws on a non-ok HTTP response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 401, statusText: "Unauthorized" })));
    const provider = new OpenAiOmniModerationProvider({ apiKey: "bad-key" });
    await expect(provider.moderate({ type: "text", text: "hello" })).rejects.toThrow(/401/);
  });

  it("throws on an unexpected response shape", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { unexpected: true })));
    const provider = new OpenAiOmniModerationProvider({ apiKey: "k" });
    await expect(provider.moderate({ type: "text", text: "hello" })).rejects.toThrow(/unexpected response shape/);
  });
});
