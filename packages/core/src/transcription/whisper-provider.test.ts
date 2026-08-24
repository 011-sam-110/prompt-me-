// Unit tests for our own request/response handling — not a claim that this
// matches OpenAI's real API (see whisper-provider.ts's top comment: no
// live key exists yet to verify that against). `fetch` is stubbed
// throughout, same style as verification/didit-provider.test.ts.
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_OPENAI_API_BASE_URL, OpenAiWhisperTranscriptionProvider, WHISPER_MODEL } from "./whisper-provider";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OpenAiWhisperTranscriptionProvider", () => {
  it("sends the api key as a bearer token, the model, and the bytes as a multipart file part", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { text: "hello world" }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenAiWhisperTranscriptionProvider({ apiKey: "secret-key" });
    const data = new Uint8Array([1, 2, 3, 4]);
    await provider.transcribe({ data, mimeType: "audio/webm" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${DEFAULT_OPENAI_API_BASE_URL}/v1/audio/transcriptions`);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret-key");
    // No Content-Type header set by hand — fetch derives the multipart
    // boundary from the FormData body itself.
    expect((init.headers as Record<string, string>)["Content-Type"]).toBeUndefined();

    const form = init.body as FormData;
    expect(form.get("model")).toBe(WHISPER_MODEL);
    const file = form.get("file") as File;
    expect(file.name).toBe("clip.webm");
    expect(file.type).toBe("audio/webm");
    expect(Array.from(new Uint8Array(await file.arrayBuffer()))).toEqual([1, 2, 3, 4]);
  });

  it("picks a filename extension from the mimeType's subtype", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { text: "x" })));
    const provider = new OpenAiWhisperTranscriptionProvider({ apiKey: "k" });
    await provider.transcribe({ data: new Uint8Array([1]), mimeType: "video/mp4" });
    const fetchMock = vi.mocked(fetch);
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    const file = (init.body as FormData).get("file") as File;
    expect(file.name).toBe("clip.mp4");
  });

  it("falls back to a webm extension for a mimeType with no clean subtype", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { text: "x" })));
    const provider = new OpenAiWhisperTranscriptionProvider({ apiKey: "k" });
    await provider.transcribe({ data: new Uint8Array([1]), mimeType: "application/octet-stream" });
    const fetchMock = vi.mocked(fetch);
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    const file = (init.body as FormData).get("file") as File;
    expect(file.name).toBe("clip.octet-stream");
  });

  it("maps a successful response to our output shape", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { text: "a real transcript" })));
    const provider = new OpenAiWhisperTranscriptionProvider({ apiKey: "k" });
    const result = await provider.transcribe({ data: new Uint8Array([1]), mimeType: "audio/wav" });
    expect(result).toEqual({ transcript: "a real transcript" });
  });

  it("respects a baseUrl override", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { text: "x" }));
    vi.stubGlobal("fetch", fetchMock);
    const provider = new OpenAiWhisperTranscriptionProvider({ apiKey: "k", baseUrl: "https://proxy.example.test" });
    await provider.transcribe({ data: new Uint8Array([1]), mimeType: "audio/wav" });
    expect(fetchMock.mock.calls[0]![0]).toBe("https://proxy.example.test/v1/audio/transcriptions");
  });

  it("throws on a non-ok HTTP response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 401, statusText: "Unauthorized" })));
    const provider = new OpenAiWhisperTranscriptionProvider({ apiKey: "bad-key" });
    await expect(provider.transcribe({ data: new Uint8Array([1]), mimeType: "audio/wav" })).rejects.toThrow(/401/);
  });

  it("throws on an unexpected response shape", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { unexpected: true })));
    const provider = new OpenAiWhisperTranscriptionProvider({ apiKey: "k" });
    await expect(provider.transcribe({ data: new Uint8Array([1]), mimeType: "audio/wav" })).rejects.toThrow(
      /unexpected response shape/,
    );
  });
});
