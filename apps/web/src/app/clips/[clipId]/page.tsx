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
import { getClipById } from "@prompt-me/db";
import { CLIP_TIER_SPECS, isValidClipTier } from "@prompt-me/core";
import { getAppDb } from "@/lib/db";
import { getAuthSession } from "@/lib/auth/session";
import { resolveClipMediaUrl } from "@/lib/clips/media-url";
import { ClipPlaybackDemo } from "@/components/player/clip-playback-demo";

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

  const format = CLIP_TIER_SPECS[clip.tier].format;
  const mediaUrl = resolveClipMediaUrl(clip);

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center gap-6 px-6 py-10">
      <h1 className="text-xl font-semibold">Clip playback</h1>
      <ClipPlaybackDemo
        clipId={clip.id}
        mediaUrl={mediaUrl}
        durationSeconds={clip.durationSeconds}
        format={format}
        isFirstClip={clip.tier === 1}
      />
    </main>
  );
}
