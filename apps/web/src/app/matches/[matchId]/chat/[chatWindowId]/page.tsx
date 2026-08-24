// ENGINEERING_SPEC.md §11 / ROADMAP.md M11's remaining "chat UI" half — one
// locked date's messages. Reached from an "Open chat" link on its own
// date_proposals row (components/date-proposals/proposal-list.tsx), a link
// that only ever exists once ProposalWithDisplay.chatWindowId is non-null
// (get-match-proposals.ts resolves it via getChatWindowByProposalId, i.e.
// only once a date is actually locked — set-venue.ts is the only place a
// chat_windows row is ever created).
//
// The server component here loads the window + full message history
// (lib/chat/get-chat-messages.ts — the same participant + active-match
// guard send-message.ts's send path enforces, via the shared
// lib/chat/load-chat-window.ts); the client component
// (components/chat/chat-window.tsx) owns everything that changes without a
// full page reload: the realtime subscription (Pusher or the dev-mock SSE
// fallback) and sending new messages through the existing
// POST /api/chat/messages endpoint.
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getAppDb } from "@/lib/db";
import { getAuthSession } from "@/lib/auth/session";
import { resolveOnboarding } from "@/lib/auth/onboarding";
import {
  ChatMatchAccessError,
  ChatMatchNotActiveError,
  ChatWindowNotFoundError,
  getChatWindowWithMessages,
} from "@/lib/chat/get-chat-messages";
import { ChatWindow } from "@/components/chat/chat-window";

export default async function ChatWindowPage({
  params,
}: {
  params: Promise<{ matchId: string; chatWindowId: string }>;
}) {
  const { matchId, chatWindowId } = await params;
  const { clerkId } = await getAuthSession();
  if (!clerkId) {
    redirect("/sign-in");
  }

  const db = await getAppDb();
  const { state, user } = await resolveOnboarding(db, clerkId);
  if (state !== "active") {
    redirect("/onboarding");
  }

  let result;
  try {
    result = await getChatWindowWithMessages(db, chatWindowId, user.id);
  } catch (error) {
    if (error instanceof ChatWindowNotFoundError || error instanceof ChatMatchAccessError) {
      notFound();
    }
    if (error instanceof ChatMatchNotActiveError) {
      // Escaped mid-visit — no messaging exists in this app to say why, so
      // land back on the matches list, where this pair no longer appears
      // (getActiveMatchesForUser already excludes it) — same fallback
      // matches/[matchId]/calendar/page.tsx's own catch takes.
      redirect("/matches");
    }
    throw error;
  }

  const { window, messages } = result;
  // A chatWindowId that's real but belongs to a DIFFERENT match than the
  // one in this URL is a 404, not a silent redirect to the "right" URL —
  // matches this codebase's existing "real id, wrong owner" handling
  // elsewhere (e.g. date-proposals' own not-found-shaped access errors).
  if (window.matchId !== matchId) {
    notFound();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-4 px-6 py-16">
      <div>
        <Link href={`/matches/${matchId}/calendar`} className="text-xs text-muted-foreground hover:underline">
          &larr; Back to planning
        </Link>
        <h1 className="text-2xl font-semibold">Chat</h1>
        <p className="text-sm text-muted-foreground">Open from an hour before your date until a few hours after.</p>
      </div>

      <ChatWindow
        chatWindowId={window.id}
        opensAt={window.opensAt.toISOString()}
        closesAt={window.closesAt.toISOString()}
        viewerId={user.id}
        initialMessages={messages.map((message) => ({
          id: message.id,
          senderId: message.senderId,
          body: message.body,
          sentAt: message.sentAt.toISOString(),
        }))}
      />
    </main>
  );
}
