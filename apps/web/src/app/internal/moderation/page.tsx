// ROADMAP.md M12: "a minimal internal review queue UI lists
// moderation_flags awaiting action (clip or chat_message flags, with
// confidence and flag_type), with actions to approve or take down the
// flagged content." Deliberately not linked from any nav in this app
// (lib/moderation/reviewer-access.ts's own comment explains the access
// model) — reached only by knowing the URL, same "auth-gated but not
// discoverable through the product surface" posture
// app/clips/[clipId]/page.tsx already takes for its own harness route.
import { redirect } from "next/navigation";
import { getPendingChatModerationFlags, getPendingClipModerationFlags } from "@prompt-me/db";
import { getAppDb } from "@/lib/db";
import { getAuthSession } from "@/lib/auth/session";
import { isAuthorizedReviewer } from "@/lib/moderation/reviewer-access";
import { ModerationQueue, type ModerationChatFlagDisplay, type ModerationClipFlagDisplay } from "@/components/moderation/moderation-queue";

export default async function ModerationReviewPage() {
  const { clerkId } = await getAuthSession();
  if (!clerkId) {
    redirect("/sign-in");
  }
  if (!isAuthorizedReviewer(clerkId)) {
    redirect("/feed");
  }

  const db = await getAppDb();
  const [pendingClipFlags, pendingChatFlags] = await Promise.all([
    getPendingClipModerationFlags(db),
    getPendingChatModerationFlags(db),
  ]);

  const clipFlags: ModerationClipFlagDisplay[] = pendingClipFlags.map(({ flag, clip }) => ({
    flagId: flag.id,
    flagType: flag.flagType,
    confidence: flag.confidence,
    createdAt: flag.createdAt,
    clipId: clip.id,
    clipTier: clip.tier,
    transcript: clip.transcript,
  }));

  const chatFlags: ModerationChatFlagDisplay[] = pendingChatFlags.map(({ flag, chatMessage }) => ({
    flagId: flag.id,
    flagType: flag.flagType,
    confidence: flag.confidence,
    createdAt: flag.createdAt,
    chatMessageId: chatMessage.id,
    body: chatMessage.body,
    sentAt: chatMessage.sentAt,
    alreadyRemoved: chatMessage.removedAt !== null,
  }));

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-16">
      <div>
        <h1 className="text-2xl font-semibold">Moderation review queue</h1>
        <p className="text-sm text-muted-foreground">
          {clipFlags.length + chatFlags.length} flag(s) awaiting action.
        </p>
      </div>
      <ModerationQueue clipFlags={clipFlags} chatFlags={chatFlags} />
    </main>
  );
}
