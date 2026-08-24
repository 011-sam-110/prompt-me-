// ROADMAP.md M3: "a real Didit implementation behind a feature flag."
// ENGINEERING_SPEC §3: "Real implementation calls Didit."
//
// No live Didit API key exists yet (ROADMAP.md → Needs from Sampo), so this
// has never run against Didit's actual service. The request/response shape
// below is a best-effort placeholder built from Didit's publicly documented
// liveness + age-estimation product, not something verified against a real
// account — treat the endpoint path and field names as provisional and
// confirm/adjust them against Didit's own docs once a real key exists and
// this can be exercised for real. That validation step belongs to whoever
// wires up the real key, not to a dev-mock-only build.
import type { VerificationCheckInput, VerificationCheckOutput, VerificationProvider } from "./types";

export const DEFAULT_DIDIT_API_BASE_URL = "https://verification.didit.me";

export interface DiditVerificationProviderConfig {
  apiKey: string;
  /** Override for tests / self-hosted proxies. Defaults to Didit's production API. */
  baseUrl?: string;
}

interface DiditCheckResponseBody {
  liveness: "pass" | "fail";
  age_estimate: "pass" | "fail";
  confidence: number;
}

function isDiditCheckResponseBody(value: unknown): value is DiditCheckResponseBody {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    (v.liveness === "pass" || v.liveness === "fail") &&
    (v.age_estimate === "pass" || v.age_estimate === "fail") &&
    typeof v.confidence === "number"
  );
}

export class DiditVerificationProvider implements VerificationProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(config: DiditVerificationProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? DEFAULT_DIDIT_API_BASE_URL;
  }

  async check(input: VerificationCheckInput): Promise<VerificationCheckOutput> {
    const response = await fetch(`${this.baseUrl}/v1/verification/check`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      // The frame data crosses the wire to Didit (that's the point of a
      // real liveness/age check) but is never written to our own storage —
      // this function returns the parsed result and nothing else; the
      // request body itself isn't retained past this call.
      body: JSON.stringify({
        selfie_frame: input.selfieFrame,
        clip_face_samples: input.clipFaceSamples,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Didit verification check failed: ${response.status} ${response.statusText}`,
      );
    }

    const body: unknown = await response.json();
    if (!isDiditCheckResponseBody(body)) {
      throw new Error("Didit verification check returned an unexpected response shape");
    }

    return {
      livenessResult: body.liveness,
      ageEstimateResult: body.age_estimate,
      confidence: body.confidence,
    };
  }
}
