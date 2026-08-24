// Unit tests for our own request/response handling — not a claim that this
// matches Google's real API (see google-places-provider.ts's top comment:
// no live key exists yet to verify that against). `fetch` is stubbed
// throughout, same style as ../moderation/omni-moderation-provider.test.ts.
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_GOOGLE_PLACES_API_BASE_URL, GooglePlacesProvider } from "./google-places-provider";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GooglePlacesProvider.searchVenues", () => {
  it("POSTs a text search with the api key + field mask headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { places: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new GooglePlacesProvider({ apiKey: "secret-key" });
    await provider.searchVenues("coffee");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${DEFAULT_GOOGLE_PLACES_API_BASE_URL}/v1/places:searchText`);
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers["X-Goog-Api-Key"]).toBe("secret-key");
    expect(headers["X-Goog-FieldMask"]).toContain("places.types");
    expect(JSON.parse(init.body as string)).toEqual({ textQuery: "coffee" });
  });

  it("maps a response and keeps only allowed public-venue types", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, {
          places: [
            {
              id: "places/abc123",
              displayName: { text: "Riverside Café" },
              formattedAddress: "12 Quay Street",
              types: ["cafe", "food", "point_of_interest"],
            },
            {
              id: "places/def456",
              displayName: { text: "Someone's House" },
              formattedAddress: "9 Elm Road",
              types: ["premise", "point_of_interest"],
            },
          ],
        }),
      ),
    );

    const provider = new GooglePlacesProvider({ apiKey: "k" });
    const results = await provider.searchVenues("café");

    expect(results).toEqual([
      { placeId: "places/abc123", name: "Riverside Café", address: "12 Quay Street", types: ["cafe", "food", "point_of_interest"] },
    ]);
  });

  it("respects a baseUrl override", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { places: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const provider = new GooglePlacesProvider({ apiKey: "k", baseUrl: "https://proxy.example.test" });
    await provider.searchVenues("x");
    expect(fetchMock.mock.calls[0]![0]).toBe("https://proxy.example.test/v1/places:searchText");
  });

  it("throws on a non-ok HTTP response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 401, statusText: "Unauthorized" })));
    const provider = new GooglePlacesProvider({ apiKey: "bad-key" });
    await expect(provider.searchVenues("x")).rejects.toThrow(/401/);
  });

  it("treats a response with no `places` array as zero results, not a crash", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, {})));
    const provider = new GooglePlacesProvider({ apiKey: "k" });
    expect(await provider.searchVenues("x")).toEqual([]);
  });
});

describe("GooglePlacesProvider.getPlace", () => {
  it("GETs the place-details endpoint with the api key + field mask headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, { id: "places/abc123", displayName: { text: "Riverside Café" }, formattedAddress: "12 Quay Street", types: ["cafe"] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new GooglePlacesProvider({ apiKey: "secret-key" });
    const place = await provider.getPlace("places/abc123");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${DEFAULT_GOOGLE_PLACES_API_BASE_URL}/v1/places/places%2Fabc123`);
    const headers = init.headers as Record<string, string>;
    expect(headers["X-Goog-Api-Key"]).toBe("secret-key");
    expect(place).toEqual({ placeId: "places/abc123", name: "Riverside Café", address: "12 Quay Street", types: ["cafe"] });
  });

  it("returns a disallowed-type place too — getPlace does NOT filter by allow-list itself", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(200, { id: "places/hotel1", displayName: { text: "The Grand Hotel" }, types: ["lodging"] })),
    );
    const provider = new GooglePlacesProvider({ apiKey: "k" });
    const place = await provider.getPlace("places/hotel1");
    expect(place).toEqual({ placeId: "places/hotel1", name: "The Grand Hotel", address: "", types: ["lodging"] });
  });

  it("returns null on a 404", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not found", { status: 404 })));
    const provider = new GooglePlacesProvider({ apiKey: "k" });
    expect(await provider.getPlace("does-not-exist")).toBeNull();
  });

  it("throws on a non-ok, non-404 response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("boom", { status: 500, statusText: "Internal Server Error" })));
    const provider = new GooglePlacesProvider({ apiKey: "k" });
    await expect(provider.getPlace("x")).rejects.toThrow(/500/);
  });

  it("throws on an unexpected response shape", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { unexpected: true })));
    const provider = new GooglePlacesProvider({ apiKey: "k" });
    await expect(provider.getPlace("x")).rejects.toThrow(/unexpected response shape/);
  });
});
