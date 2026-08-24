// Clerk webhook — the other half of ROADMAP.md M2's "on first sign-in
// create a corresponding users row... exactly once per account (webhook
// or server action on session creation)". The server-action half
// (lib/auth/onboarding.ts's resolveOnboarding, called on every
// authenticated request) is what actually runs today, since there's no
// real Clerk deployment yet to send this endpoint anything; this route
// exists so account-creation isn't solely dependent on it once Clerk (and
// CLERK_WEBHOOK_SECRET) are configured for real — webhook delivery is
// best-effort, so it shouldn't be the *only* trigger anyway.
//
// "Exactly once" doesn't depend on only one of the two triggers ever
// firing: ensureUserForClerkId (packages/db/src/queries/users.ts) is
// idempotent, backed by the users_clerk_id_idx UNIQUE constraint.
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { ensureUserForClerkId } from "@prompt-me/db";
import { getAppDb } from "@/lib/db";
import { isClerkConfigured } from "@/lib/auth/config";

interface ClerkWebhookEvent {
  type: string;
  data: { id: string };
}

export async function POST(req: Request): Promise<NextResponse> {
  if (!isClerkConfigured()) {
    // No real Clerk deployment can be sending webhooks in dev mode.
    return NextResponse.json({ error: "Clerk is not configured" }, { status: 404 });
  }

  const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: "CLERK_WEBHOOK_SECRET is not set" }, { status: 500 });
  }

  const payload = await req.text();
  const headerList = await headers();
  const svixHeaders = {
    "svix-id": headerList.get("svix-id") ?? "",
    "svix-timestamp": headerList.get("svix-timestamp") ?? "",
    "svix-signature": headerList.get("svix-signature") ?? "",
  };

  let event: ClerkWebhookEvent;
  try {
    event = new Webhook(webhookSecret).verify(payload, svixHeaders) as ClerkWebhookEvent;
  } catch {
    return NextResponse.json({ error: "invalid webhook signature" }, { status: 400 });
  }

  if (event.type === "user.created") {
    const db = await getAppDb();
    await ensureUserForClerkId(db, event.data.id);
  }

  return NextResponse.json({ received: true });
}
