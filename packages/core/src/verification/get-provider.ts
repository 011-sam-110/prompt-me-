// The actual "used automatically when no Didit key is configured" switch —
// ROADMAP.md M3's acceptance bullet, worded exactly that way.
import { isDiditConfigured } from "./config";
import { DevMockVerificationProvider } from "./dev-mock-provider";
import { DiditVerificationProvider } from "./didit-provider";
import type { VerificationProvider } from "./types";

/**
 * Returns the real Didit-backed provider when `DIDIT_API_KEY` is set,
 * otherwise the deterministic dev-mock. Callers never branch on
 * `isDiditConfigured()` themselves — this is the single place that
 * decision is made, so a page/server-action always gets a working
 * provider with zero credentials.
 */
export function getVerificationProvider(): VerificationProvider {
  if (isDiditConfigured()) {
    return new DiditVerificationProvider({
      apiKey: process.env.DIDIT_API_KEY!,
      baseUrl: process.env.DIDIT_API_BASE_URL,
    });
  }
  return new DevMockVerificationProvider();
}
