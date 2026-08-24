// UI evidence for the M5 scroll navigation shell (SPEC.md §3, ROADMAP.md
// M5). Two independent gestures, proven against a real two-clip profile
// uploaded through the real /api/clips endpoint (M4):
//
//  - Vertical "pass" gesture: locked until clip 1 reaches 5 real timeline
//    seconds (ENGINEERING_SPEC §5), same mechanism player.spec.ts already
//    covers for a single-clip profile — re-proven here on a multi-clip
//    stack to show it still holds once clip-stack-nav.tsx wraps ClipPlayer
//    instead of the old single-clip demo.
//  - Lateral gesture (new): moves between this profile's own clips, in
//    upload order (SPEC.md §3) — locked past clip 1 until the *server*
//    reports clip 1 complete (not a locally-computed guess; see
//    ClipPlayer's onCompletedChange / @prompt-me/core's
//    maxUnlockedClipIndex), independent of the vertical gate above.
//
// Note on mouse handling below: hold-to-2x is driven with raw
// page.mouse.down()/up() rather than a locator click, exactly like
// player.spec.ts — and deliberately never moved elsewhere *while* held.
// ClipPlayer's hold-2x listens for `pointerleave` on the button itself as
// one of its release triggers (clip-player.tsx), so hovering a different
// element mid-hold would end the hold early rather than testing a
// sustained 2x hold at all.
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const shotsDir = resolve(__dirname, "../../../.claude/debug-shots");

function makeWavFixture(durationSeconds: number, sampleRate = 8000): Buffer {
  const numSamples = Math.round(durationSeconds * sampleRate);
  const dataSize = numSamples * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  return buf;
}

test("scroll navigation shell: lateral move between a profile's own clips, gated on completion; vertical pass-scroll gated on clip 1's 5s mark", async ({
  page,
}) => {
  await page.goto("/sign-up");
  await page.getByRole("button", { name: "Create a dev account" }).click();
  await expect(page).toHaveURL(/\/onboarding/);

  // Tier 1: real 15s WAV, audio format. Tier 2: same WAV-fixture trick
  // upload.test.ts already relies on (declared video/webm mimeType over
  // real WAV bytes — probeClipDurationSeconds falls back to a hint-free
  // re-parse, so the real ~30s duration still measures correctly) — no
  // real video encoder is needed just to prove the *navigation shell*
  // works; that's this spec's job, not re-proving duration probing.
  const tier1Upload = await page.request.post("/api/clips", {
    multipart: {
      file: { name: "clip1.wav", mimeType: "audio/wav", buffer: makeWavFixture(15) },
      tier: "1",
      customPromptText: "M5 lateral-nav fixture — clip 1",
    },
  });
  expect(tier1Upload.ok()).toBeTruthy();
  const { clip: clip1 } = await tier1Upload.json();

  const tier2Upload = await page.request.post("/api/clips", {
    multipart: {
      file: { name: "clip2.wav", mimeType: "video/webm", buffer: makeWavFixture(30) },
      tier: "2",
      customPromptText: "M5 lateral-nav fixture — clip 2",
    },
  });
  expect(tier2Upload.ok()).toBeTruthy();
  const { clip: clip2 } = await tier2Upload.json();

  await page.goto(`/clips/${clip1.id}`);
  await expect(page.getByRole("heading", { name: "Clip playback" })).toBeVisible();

  const verticalContainer = page.locator("[data-scroll-lock-container]");
  const lateralContainer = page.locator("[data-lateral-scroll-container]");
  const slide0 = page.locator('[data-clip-slide][data-clip-index="0"]');
  const slide1 = page.locator('[data-clip-slide][data-clip-index="1"]');
  const player0 = slide0.locator("[data-clip-player]");
  const player1 = slide1.locator("[data-clip-player]");

  // Both clips are present, in upload order (tier 1 then tier 2).
  await expect(player0).toHaveAttribute("data-clip-id", clip1.id);
  await expect(player1).toHaveAttribute("data-clip-id", clip2.id);

  // Fresh load: vertical is locked (clip 1 hasn't reached 5s) and lateral
  // hasn't unlocked past clip 1 either (clip 1 isn't complete yet).
  await expect(verticalContainer).toHaveAttribute("data-scroll-locked", "true");
  await expect(lateralContainer).toHaveAttribute("data-max-unlocked-index", "0");
  await expect(player0).toHaveAttribute("data-locked", "true");

  await slide0.getByRole("button", { name: "Play" }).click();
  await expect
    .poll(() =>
      player0.evaluate((el) => (el.querySelector("audio, video") as HTMLMediaElement).duration),
    )
    .toBeGreaterThan(0);

  // Mid-clip, both gestures blocked: vertical scroll does nothing (the
  // pass gesture is locked)...
  await verticalContainer.hover();
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(200);
  expect(await verticalContainer.evaluate((el) => el.scrollTop)).toBe(0);

  // ...and neither does a lateral (sideways) scroll attempt toward clip 2 —
  // clip 1 hasn't been completed yet, so SPEC.md §3's "each clip must
  // finish before the next unlocks" holds here too.
  await lateralContainer.hover();
  await page.mouse.wheel(900, 0);
  await page.waitForTimeout(200);
  expect(await lateralContainer.evaluate((el) => el.scrollLeft)).toBe(0);

  await page.screenshot({ path: resolve(shotsDir, "m5-03-mid-clip-lateral-locked.png") });

  // Hold-to-2x on clip 1 to reach the 5s vertical-unlock threshold quickly
  // — position-based, per ENGINEERING_SPEC §5, so 2x speed just gets there
  // in less wall time, it never skips content. Held and released as one
  // uninterrupted gesture over the button itself (see file-header note).
  const holdButton0 = slide0.locator("[data-hold-2x]");
  const holdBox0 = await holdButton0.boundingBox();
  if (!holdBox0) throw new Error("clip 1's hold-to-2x button has no bounding box");
  await page.mouse.move(holdBox0.x + holdBox0.width / 2, holdBox0.y + holdBox0.height / 2);
  await page.mouse.down();
  await expect(player0).toHaveAttribute("data-locked", "false", { timeout: 20_000 });
  await page.mouse.up();

  await expect(verticalContainer).toHaveAttribute("data-scroll-locked", "false");

  // The vertical gate just released, but clip 1 (15s) is nowhere near
  // finished yet (only ~5s in) — the lateral gate is a completely separate
  // rule and must still hold: still can't reach clip 2 sideways.
  await expect(lateralContainer).toHaveAttribute("data-max-unlocked-index", "0");
  await lateralContainer.hover();
  await page.mouse.wheel(900, 0);
  await page.waitForTimeout(200);
  expect(await lateralContainer.evaluate((el) => el.scrollLeft)).toBe(0);

  // Vertical, meanwhile, is now open — the pass gesture actually moves to
  // "the next candidate" (a different axis/target from the lateral one).
  await verticalContainer.hover();
  await page.mouse.wheel(0, 900);
  await expect.poll(() => verticalContainer.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await expect(page.getByTestId("next-candidate")).toBeVisible();
  await verticalContainer.evaluate((el) => el.scrollTo({ top: 0 }));

  // Re-engage hold-2x (same button, same uninterrupted-gesture rule) to
  // run clip 1 out to full, server-reported completion. Re-measured rather
  // than reusing holdBox0: the scroll-lock banner's text just changed
  // ("locked" -> "unlocked", clip-player.tsx), which can reflow the
  // button row beneath it, so the earlier coordinates may no longer land
  // on the button.
  const holdBox0Again = await holdButton0.boundingBox();
  if (!holdBox0Again) throw new Error("clip 1's hold-to-2x button has no bounding box");
  await page.mouse.move(holdBox0Again.x + holdBox0Again.width / 2, holdBox0Again.y + holdBox0Again.height / 2);
  await page.mouse.down();
  await expect(player0).toHaveAttribute("data-completed", "true", { timeout: 30_000 });
  await page.mouse.up();

  // Only now does the lateral gate open — driven by the server's own
  // completion response (ClipPlayer's onCompletedChange), never a locally
  // computed currentTime>=duration guess.
  await expect(lateralContainer).toHaveAttribute("data-max-unlocked-index", "1");

  await lateralContainer.hover();
  await page.mouse.wheel(900, 0);
  await expect.poll(() => lateralContainer.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  // Confirm the scroll actually landed on slide index 1 (clip 2), not just
  // that *some* scrolling happened — scrollLeft alone being > 0 wouldn't
  // distinguish "moved one full slide" from "nudged a few pixels."
  await expect
    .poll(() =>
      lateralContainer.evaluate((el) => Math.round(el.scrollLeft / (el.clientWidth || 1))),
    )
    .toBe(1);
  await expect(player1).toBeVisible();

  await page.screenshot({ path: resolve(shotsDir, "m5-04-post-completion-lateral-unlocked.png") });
});
