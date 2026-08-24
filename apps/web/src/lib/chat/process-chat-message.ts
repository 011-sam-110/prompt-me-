// The async post-send moderation pass ENGINEERING_SPEC.md §12 describes for
// chat messages: "Chat messages get the same text-moderation pass, async,
// with reviewed follow-up rather than blocking send (blocking would
// undermine the real-time logistics purpose of the window)." Mirrors
// lib/clips/process-clip.ts's shape closely (same getModerationProvider()
// + recordModerationResult composition, both now sharing
// lib/moderation/record-flags.ts) — but with no moderation_status-style
// gate to flip afterward: a chat message is already visible to its
// recipient and broadcast over realtime the instant it's sent
// (send-message.ts calls enqueueChatMessageModeration only after that
// succeeds), so this never blocks or un-sends anything. It only ever adds
// `moderation_flags` rows for a human reviewer to act on later
// (ROADMAP.md M12's review queue, lib/moderation/review-flag.ts).
import { getModerationProvider } from "@prompt-me/core";
import type { AnyDb } from "@prompt-me/db";
import { recordModerationResult } from "../moderation/record-flags";

/**
 * Text-only (SPEC.md §8 / ENGINEERING_SPEC §11 chat has no image/video
 * content to moderate, unlike a clip's sampled frames) — one moderation
 * call against the message body, flagged categories recorded against
 * `chatMessageId`. Exported (not just the enqueue wrapper below) so tests
 * can await it directly instead of racing the fire-and-forget entry point,
 * same reason process-clip.ts's processClipUpload is itself exported and
 * tested directly rather than only through enqueueClipProcessing.
 */
export async function processChatMessageModeration(db: AnyDb, chatMessageId: string, body: string): Promise<void> {
  const result = await getModerationProvider().moderate({ type: "text", text: body });
  await recordModerationResult(db, { chatMessageId }, result);
}

/**
 * Fire-and-forget entry point — lib/chat/send-message.ts calls this
 * (never awaited) right after a message is persisted, so a slow or failing
 * moderation call can never delay or block the send itself. Failures are
 * logged, not thrown into the void, same posture as
 * process-clip.ts's enqueueClipProcessing — a moderation-provider outage
 * here should never retroactively affect a message that's already been
 * delivered.
 */
export function enqueueChatMessageModeration(db: AnyDb, chatMessageId: string, body: string): void {
  processChatMessageModeration(db, chatMessageId, body).catch((error: unknown) => {
    console.error(`enqueueChatMessageModeration: failed for chatMessageId=${chatMessageId}`, error);
  });
}
