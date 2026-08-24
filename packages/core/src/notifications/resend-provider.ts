// ENGINEERING_SPEC §14: "Email (via Resend)." No live Resend API key
// exists yet (ROADMAP.md → Needs from Sampo), so this has never run
// against Resend's actual service — same "best-effort placeholder, treat
// as provisional" caveat as ../verification/didit-provider.ts's and
// ../moderation/omni-moderation-provider.ts's top comments. Request shape
// below matches Resend's publicly documented POST /emails endpoint
// (from/to/subject/text as top-level JSON fields, Bearer API-key auth).
import { renderNotificationEmail } from "./templates";
import type { NotificationEvent, NotificationProvider } from "./types";

export const DEFAULT_RESEND_API_BASE_URL = "https://api.resend.com";

export interface ResendNotificationProviderConfig {
  apiKey: string;
  /** Resend requires a `from` address on a domain verified with them —
   * there's no sane repo-wide default, so unlike the OpenAI/Didit
   * providers' optional baseUrl override, this one is required (also
   * enforced by config.ts's isResendConfigured() before this class is ever
   * constructed — see get-provider.ts). */
  fromEmail: string;
  /** Override for tests / self-hosted proxies. Defaults to Resend's
   * production API. */
  baseUrl?: string;
}

export class ResendNotificationProvider implements NotificationProvider {
  private readonly apiKey: string;
  private readonly fromEmail: string;
  private readonly baseUrl: string;

  constructor(config: ResendNotificationProviderConfig) {
    this.apiKey = config.apiKey;
    this.fromEmail = config.fromEmail;
    this.baseUrl = config.baseUrl ?? DEFAULT_RESEND_API_BASE_URL;
  }

  async send(event: NotificationEvent): Promise<void> {
    const { subject, text } = renderNotificationEmail(event);

    const response = await fetch(`${this.baseUrl}/emails`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.fromEmail,
        to: event.recipientEmail,
        subject,
        text,
      }),
    });

    if (!response.ok) {
      throw new Error(`Resend email send failed: ${response.status} ${response.statusText}`);
    }
  }
}
