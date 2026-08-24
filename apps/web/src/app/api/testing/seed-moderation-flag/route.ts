// Test-only fixture endpoint for ROADMAP.md M12's review-queue UI
// evidence — NOT part of the product surface. Exists because
// @prompt-me/core's moderation dev-mock is deliberately, permanently
// "always clean" (DevMockModerationProvider's own header comment: "there's
// no real moderation model to run without a credential, so pretending to
// analyze the content and then declaring it clean would be no more honest
// than just declaring it clean outright"), which means the real upload/
// send flows this app actually ships can never produce a flagged row
// without a live OPENAI_API_KEY — one doesn't exist yet (ROADMAP.md ->
// Needs from Sampo). CLAUDE.md's Playwright-evidence requirement still
// needs a genuinely flagged clip and chat message to drive the review
// queue's Approve/Take-down actions against for real, so this route seeds
// exactly that precondition data directly through the same @prompt-me/db
// query layer the real pipeline writes through (lib/clips/process-clip.ts,
// lib/chat/process-chat-message.ts) — it never touches or stands in for
// the moderation *decision* itself, only recreates what a real flagged
// scan would have already left behind by the time a reviewer opens the
// queue.
//
// Gated off entirely once a real database is configured
// (shouldUseRealDb()) — the same on/off switch apps/web/src/lib/db.ts
// already uses to pick getDb() vs getDevDb(), so this route is live
// exactly when the app is already running against the throwaway
// file-backed dev database and never against anything real.
import { NextResponse } from "next/server";
import {
  acceptDateProposal,
  createChatMessage,
  createChatWindowIfNotExists,
  createDateProposal,
  ensureUserForClerkId,
  insertClip,
  insertMatchIfNotExists,
  insertModerationFlag,
  updateClipModerationStatus,
  updateClipTranscript,
} from "@prompt-me/db";
import { getAppDb, shouldUseRealDb } from "@/lib/db";
import { getAuthSession } from "@/lib/auth/session";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

export async function POST(): Promise<NextResponse> {
  if (shouldUseRealDb()) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const { clerkId } = await getAuthSession();
  if (!clerkId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const db = await getAppDb();
  const owner = await ensureUserForClerkId(db, clerkId);
  // A fixed clerk id, not a fresh random one per call: ensureUserForClerkId
  // is idempotent, so re-running this seed (a re-run of the Playwright
  // spec) reuses the same synthetic partner and match instead of piling up
  // a new one every time.
  const partner = await ensureUserForClerkId(db, "dev_seed_moderation_partner");

  const clip = await insertClip(db, {
    userId: owner.id,
    tier: 1,
    durationSeconds: 15,
    storageUrl: "dev-blob://seed/moderation-review-clip.wav",
    customPromptText: "[seeded for M12 review-queue evidence]",
  });
  await updateClipTranscript(db, clip.id, "a seeded transcript standing in for a real flagged scan");
  await updateClipModerationStatus(db, clip.id, "pending_review");
  const clipFlag = await insertModerationFlag(db, {
    clipId: clip.id,
    flagType: "sexual",
    confidence: 0.82,
  });

  const match = await insertMatchIfNotExists(db, { userAId: owner.id, userBId: partner.id });
  const slotStartAt = new Date(Date.now() + 24 * HOUR_MS);
  const proposal = await createDateProposal(db, {
    matchId: match.id,
    proposedByUserId: owner.id,
    ideaText: "Coffee",
    slotStartAt,
    slotEndAt: new Date(slotStartAt.getTime() + HOUR_MS),
  });
  await acceptDateProposal(db, proposal.id);
  const window = await createChatWindowIfNotExists(db, {
    matchId: match.id,
    dateProposalId: proposal.id,
    opensAt: new Date(slotStartAt.getTime() - 60 * MINUTE_MS),
    closesAt: new Date(slotStartAt.getTime() + 4 * HOUR_MS),
  });
  const message = await createChatMessage(db, {
    chatWindowId: window.id,
    senderId: owner.id,
    body: "a seeded message standing in for a real flagged send",
  });
  const chatFlag = await insertModerationFlag(db, {
    chatMessageId: message.id,
    flagType: "harassment",
    confidence: 0.61,
  });

  return NextResponse.json({
    clipId: clip.id,
    clipFlagId: clipFlag.id,
    chatMessageId: message.id,
    chatFlagId: chatFlag.id,
  });
}
