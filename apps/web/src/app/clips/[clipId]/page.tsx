// ROADMAP.md M5: "Clip playback engine." Standalone harness for the player
// itself — auth-gated ("signed in") but deliberately not gated on the
// M2/M3 onboarding-active state or any feed-membership/match check: which
// *viewer* is allowed to see *this* clip at all is M6 (candidate feed) and
// M7's (match lifecycle) job, not this milestone's. The real product
// surface for reaching a clip is the discovery feed once M6 exists; this
// route proves the playback mechanism works, the same role feed/page.tsx
// played for the M2/M3 onboarding gate before M6 replaced it with the real
// thing.
//
// One exception, added by ROADMAP.md M12: neither M6's candidate query nor
// this route ever filtered on `moderation_status` (queries/clips.ts's own
// getClipIdsForUser comment says as much, for the match-completion side),
// which means this was, until now, the one and only gap in ENGINEERING_SPEC
// §12's "the clip stays invisible to other users until a human clears it"
// — this is the only place clip bytes are ever actually served, so it's
// the correct enforcement point regardless of which milestone originally
// should have added it. Scoped narrowly to avoid destabilizing every other
// milestone's already-proven "watch the other side's clip" Playwright
// flow (M5/M7-M11): only `pending_review`/`rejected` — a real, confirmed
// moderation hit — block a non-owner. `processing` (the split-second
// window between an upload's HTTP response returning and its
// fire-and-forget process-clip.ts pass finishing, lib/clips/process-clip.ts's
// own header comment) stays visible exactly as it always has, so this
// closes a real gap without introducing a race those other specs never had
// to account for — no existing flow ever produces a `pending_review`/
// `rejected` clip in the first place (the moderation dev-mock is always
// clean), so this is a no-op against every test that predates M12.
import { notFound, redirect } from "next/navigation";
import { ensureUserForClerkId, getClipById, getClipsForUserInUploadOrder, type Clip } from "@prompt-me/db";
import { CLIP_TIER_SPECS, isValidClipTier, type ClipTier } from "@prompt-me/core";
import { getAppDb } from "@/lib/db";
import { getAuthSession } from "@/lib/auth/session";
import { resolveClipMediaUrl } from "@/lib/clips/media-url";
import { ClipStackNav, type ClipStackNavClip } from "@/components/player/clip-stack-nav";

/** ENGINEERING_SPEC §12: a flag confirmed but not yet cleared blocks a
 * non-owner; `processing` (not yet scanned) and `approved` (cleared, or
 * never flagged) both stay visible — see this file's header comment. */
function isHiddenFromNonOwner(clip: Clip): boolean {
  return clip.moderationStatus === "pending_review" || clip.moderationStatus === "rejected";
}

export default async function ClipPlayerPage({
  params,
}: {
  params: Promise<{ clipId: string }>;
}) {
  const { clerkId } = await getAuthSession();
  if (!clerkId) {
    redirect("/sign-in");
  }

  const { clipId } = await params;
  const db = await getAppDb();
  const clip = await getClipById(db, clipId);
  if (!clip || !isValidClipTier(clip.tier)) {
    notFound();
  }

  const viewer = await ensureUserForClerkId(db, clerkId);
  const isOwner = viewer.id === clip.userId;
  // Same "404, don't confirm the clip exists at all" shape a bad clip id
  // already gets above — a prober who guesses a real (flagged) clip id
  // can't tell that apart from a made-up one.
  if (!isOwner && isHiddenFromNonOwner(clip)) {
    notFound();
  }

  // SPEC.md §3: lateral scroll moves between *this profile's own* clips,
  // in upload order — so the harness loads the whole stack the requested
  // clip belongs to (its owner's uploads), not just the one clip id in the
  // URL. Which *viewer* may reach this profile at all is still M6/M7's
  // job, unchanged from the original M5 scope note.
  const stack = await getClipsForUserInUploadOrder(db, clip.userId);
  const clipsForNav: ClipStackNavClip[] = stack
    .filter((row): row is typeof row & { tier: ClipTier } => isValidClipTier(row.tier))
    // Owner always sees their own full stack (including anything still
    // processing or under review); a non-owner's lateral nav silently
    // skips any sibling clip that isn't currently visible to them either,
    // rather than offering a dot that 404s if tapped.
    .filter((row) => isOwner || !isHiddenFromNonOwner(row))
    .map((row) => ({
      clipId: row.id,
      mediaUrl: resolveClipMediaUrl(row),
      durationSeconds: row.durationSeconds,
      format: CLIP_TIER_SPECS[row.tier].format,
    }));

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center gap-6 px-6 py-10">
      <h1 className="text-xl font-semibold">Clip playback</h1>
      <ClipStackNav clips={clipsForNav} />
    </main>
  );
}
