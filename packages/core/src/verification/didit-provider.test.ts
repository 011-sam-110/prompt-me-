// Unit tests for our own request/response handling — not a claim that this
// matches Didit's real API (see didit-provider.ts's top comment: no live
// key exists yet to verify that against). `fetch` is stubbed throughout.
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_DIDIT_API_BASE_URL, DiditVerificationProvider } from "./didit-provider";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DiditVerificationProvider", () => {
  it("sends the api key as a bearer token and the frames as the request body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, { liveness: "pass", age_estimate: "pass", confidence: 0.91 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new DiditVerificationProvider({ apiKey: "secret-key" });
    await provider.check({ selfieFrame: "data:image/jpeg;base64,SELFIE", clipFaceSamples: ["a", "b"] });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${DEFAULT_DIDIT_API_BASE_URL}/v1/verification/check`);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret-key");
    expect(JSON.parse(init.body as string)).toEqual({
      selfie_frame: "data:image/jpeg;base64,SELFIE",
      clip_face_samples: ["a", "b"],
    });
  });

  it("maps a passing response to our output shape", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(200, { liveness: "pass", age_estimate: "pass", confidence: 0.83 })),
    );
    const provider = new DiditVerificationProvider({ apiKey: "k" });
    const result = await provider.check({ selfieFrame: "x", clipFaceSamples: [] });
    expect(result).toEqual({ livenessResult: "pass", ageEstimateResult: "pass", confidence: 0.83 });
  });

  it("maps a failing response to our output shape without throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(200, { liveness: "fail", age_estimate: "pass", confidence: 0.4 })),
    );
    const provider = new DiditVerificationProvider({ apiKey: "k" });
    const result = await provider.check({ selfieFrame: "x", clipFaceSamples: [] });
    expect(result).toEqual({ livenessResult: "fail", ageEstimateResult: "pass", confidence: 0.4 });
  });

  it("respects a baseUrl override", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, { liveness: "pass", age_estimate: "pass", confidence: 0.9 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const provider = new DiditVerificationProvider({ apiKey: "k", baseUrl: "https://proxy.example.test" });
    await provider.check({ selfieFrame: "x", clipFaceSamples: [] });
    expect(fetchMock.mock.calls[0]![0]).toBe("https://proxy.example.test/v1/verification/check");
  });

  it("throws on a non-ok HTTP response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 401, statusText: "Unauthorized" })));
    const provider = new DiditVerificationProvider({ apiKey: "bad-key" });
    await expect(provider.check({ selfieFrame: "x", clipFaceSamples: [] })).rejects.toThrow(/401/);
  });

  it("throws on an unexpected response shape", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { unexpected: true })));
    const provider = new DiditVerificationProvider({ apiKey: "k" });
    await expect(provider.check({ selfieFrame: "x", clipFaceSamples: [] })).rejects.toThrow(/unexpected response shape/);
  });
});
