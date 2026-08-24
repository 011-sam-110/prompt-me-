// ENGINEERING_SPEC.md §1: "Realtime: Pusher Channels, for the time-gated
// chat (§11) — Vercel functions can't hold long-lived sockets, so chat
// needs a managed pub/sub layer." No live PUSHER_* credentials exist yet
// (ROADMAP.md -> Needs from Sampo), same "provisional, never run against
// the real service" caveat as ../verification/didit-provider.ts's and
// ../places/google-places-provider.ts's own top comments.
//
// Talks to Pusher's HTTP trigger API directly
// (https://pusher.com/docs/channels/library_auth_reference/rest-api/) with
// `fetch` + Node's own crypto, rather than the official `pusher` npm SDK —
// same choice google-places-provider.ts / didit-provider.ts already made
// for their own external calls. That keeps this file testable by stubbing
// global fetch exactly like google-places-provider.test.ts does, and adds
// zero runtime dependencies for a single REST call.
import { createHash, createHmac } from "node:crypto";
import type { RealtimeProvider } from "./types";

export interface PusherRealtimeProviderConfig {
  appId: string;
  key: string;
  secret: string;
  cluster: string;
  /** Override for tests / a self-hosted-compatible proxy. Defaults to
   * Pusher's own production REST API for `cluster`. */
  baseUrl?: string;
}

function defaultBaseUrl(cluster: string): string {
  return `https://api-${cluster}.pusher.com`;
}

export class PusherRealtimeProvider implements RealtimeProvider {
  private readonly appId: string;
  private readonly key: string;
  private readonly secret: string;
  private readonly baseUrl: string;

  constructor(config: PusherRealtimeProviderConfig) {
    this.appId = config.appId;
    this.key = config.key;
    this.secret = config.secret;
    this.baseUrl = config.baseUrl ?? defaultBaseUrl(config.cluster);
  }

  async trigger(channel: string, event: string, payload: unknown): Promise<void> {
    const path = `/apps/${this.appId}/events`;
    // Pusher's trigger body wraps the actual payload as a JSON-encoded
    // string inside the `data` field (its own REST API's documented
    // shape) — the client side (pusher-js's channel.bind callback) decodes
    // it back into an object automatically.
    const body = JSON.stringify({ name: event, channels: [channel], data: JSON.stringify(payload) });
    const bodyMd5 = createHash("md5").update(body).digest("hex");
    const authTimestamp = Math.floor(Date.now() / 1000).toString();

    const params = new URLSearchParams({
      auth_key: this.key,
      auth_timestamp: authTimestamp,
      auth_version: "1.0",
      body_md5: bodyMd5,
    });
    // Pusher's signature covers the query string sorted by key —
    // URLSearchParams doesn't guarantee that on construction, so sort
    // explicitly before computing the string-to-sign below.
    params.sort();

    const stringToSign = ["POST", path, params.toString()].join("\n");
    const signature = createHmac("sha256", this.secret).update(stringToSign).digest("hex");
    params.set("auth_signature", signature);

    const response = await fetch(`${this.baseUrl}${path}?${params.toString()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });

    if (!response.ok) {
      throw new Error(`Pusher trigger failed: ${response.status} ${response.statusText}`);
    }
  }
}
