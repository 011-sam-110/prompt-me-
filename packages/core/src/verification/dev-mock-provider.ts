// ROADMAP.md M3: "a deterministic dev-mock" — ENGINEERING_SPEC §3: "Dev
// fallback returns a deterministic pass." Used automatically (see
// get-provider.ts) whenever no real Didit API key is configured, which is
// the case for the whole repo today (ROADMAP.md → Needs from Sampo: Didit
// API key still open).
import type { VerificationCheckInput, VerificationCheckOutput, VerificationProvider } from "./types";

/**
 * Fixed confidence score the dev-mock always reports. Deliberately not
 * randomized — "deterministic" is the whole point: the same input (or any
 * input at all; the frame's actual content is never inspected) always
 * produces the exact same result, so tests built against it never flake.
 */
export const DEV_MOCK_VERIFICATION_CONFIDENCE = 0.98;

/**
 * Always passes both sub-checks, ignoring the actual frame content
 * entirely — it never even reads `input`. This is intentional: a dev-mock
 * that inspected the frame to decide pass/fail would stop being
 * deterministic in any meaningful sense (its behavior would depend on
 * whatever fake bytes a test happened to pass), and there is no real face
 * to check against in a credential-free dev environment anyway.
 */
export class DevMockVerificationProvider implements VerificationProvider {
  // Underscore-prefixed and genuinely unused (see class doc comment above)
  // — allowed by both packages' eslint config's argsIgnorePattern.
  async check(_input: VerificationCheckInput): Promise<VerificationCheckOutput> {
    return {
      livenessResult: "pass",
      ageEstimateResult: "pass",
      confidence: DEV_MOCK_VERIFICATION_CONFIDENCE,
    };
  }
}
