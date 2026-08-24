// ROADMAP.md M5: "Clip playback engine." Standalone harness for the player
// itself — auth-gated ("signed in") but deliberately not gated on the
// M2/M3 onboarding-active state or any feed-membership/match check: which
// *viewer* is allowed to see *this* clip at all is M6 (candidate feed) and
// M7's (match lifecycle) job, not this milestone's. The real product
// surface for reaching a clip is the discovery feed once M6 exists; this
// route proves the playback mechanism works, the same role feed/page.tsx
// played for the M2/M3 onboarding gate before M6 replaced it with the real
// thing.
import { notFound, redirect } from "next/navigation";
import { getClipById, getClipsForUserInUploadOrder } from "@prompt-me/db";
import { CLIP_TIER_SPECS, isValidClipTier, type ClipTier } from "@prompt-me/core";
import { getAppDb } from "@/lib/db";
import { getAuthSession } from "@/lib/auth/session";
import { resolveClipMediaUrl } from "@/lib/clips/media-url";
import { ClipStackNav, type ClipStackNavClip } from "@/components/player/clip-stack-nav";

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

  // SPEC.md §3: lateral scroll moves between *this profile's own* clips,
  // in upload order — so the harness loads the whole stack the requested
  // clip belongs to (its owner's uploads), not just the one clip id in the
  // URL. Which *viewer* may reach this profile at all is still M6/M7's
  // job, unchanged from the original M5 scope note.
  const stack = await getClipsForUserInUploadOrder(db, clip.userId);
  const clipsForNav: ClipStackNavClip[] = stack
    .filter((row): row is typeof row & { tier: ClipTier } => isValidClipTier(row.tier))
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
