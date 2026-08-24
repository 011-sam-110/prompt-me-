// ENGINEERING_SPEC.md §14 / ROADMAP.md M13's clock-driven trigger: "chat
// window opening in 15 minutes." Everything that decides WHICH windows are
// due and sends their reminder lives in
// lib/notifications/notify-chat-window-opening.ts's
// sendDueChatWindowOpeningReminders — this route is a thin wrapper around
// it, same "route handler is a thin auth+parsing wrapper around the real
// composition point" split lib/chat/send-message.ts's own header comment
// documents for apps/web/src/app/api/chat/messages/route.ts.
//
// vercel.json wires this to Vercel Cron on a schedule. Vercel signs cron
// requests with `Authorization: Bearer $CRON_SECRET` when CRON_SECRET is
// set on the project — checked here the same way any other "missing
// credential never blocks a build" adapter in this repo degrades: with no
// CRON_SECRET configured (today's default — ROADMAP.md -> Needs from
// Sampo), the check is skipped entirely rather than locking the route out,
// so a local `curl localhost:3000/api/cron/chat-window-reminders` still
// works with zero setup.
import { NextResponse } from "next/server";
import { getAppDb } from "@/lib/db";
import { sendDueChatWindowOpeningReminders } from "@/lib/notifications/notify-chat-window-opening";

function isAuthorizedCronRequest(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return true;
  }
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: Request): Promise<NextResponse> {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = await getAppDb();
  const sentChatWindowIds = await sendDueChatWindowOpeningReminders(db);
  return NextResponse.json({ sentChatWindowIds });
}
