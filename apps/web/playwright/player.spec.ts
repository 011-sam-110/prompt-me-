// UI evidence for ROADMAP.md M5 (CLAUDE.md: Playwright screenshots to
// .claude/debug-shots/ for UI milestones). Uploads a real tier-1 clip
// through the real /api/clips endpoint (M4) — a genuine 15-second WAV
// fixture, not a shortcut around the tier-duration check — then drives the
// player itself against it: the vertical scroll lock and its release
// (ENGINEERING_SPEC §5: "until currentTime >= 5s on clip 1"), the
// no-forward-seek guard, hold-to-2x changing playbackRate without jumping
// currentTime, and completion only ever flipping from the server's own
// response.
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

test("clip player enforces the scroll lock, hold-to-2x, no-forward-seek, and server-reported completion", async ({
  page,
}) => {
  // Dev-mode sign-up (creates a real `users` row + session cookie) —
  // mirrors onboarding.spec.ts/verification.spec.ts. The player harness
  // page only requires "signed in," not the M2/M3 onboarding-active state.
  await page.goto("/sign-up");
  await page.getByRole("button", { name: "Create a dev account" }).click();
  await expect(page).toHaveURL(/\/onboarding/);

  const wav = makeWavFixture(15);
  const uploadResponse = await page.request.post("/api/clips", {
    multipart: {
      file: { name: "clip.wav", mimeType: "audio/wav", buffer: wav },
      tier: "1",
      customPromptText: "M5 Playwright fixture clip",
    },
  });
  expect(uploadResponse.ok()).toBeTruthy();
  const { clip } = await uploadResponse.json();
  expect(clip.id).toBeTruthy();

  await page.goto(`/clips/${clip.id}`);
  await expect(page.getByRole("heading", { name: "Clip playback" })).toBeVisible();

  const player = page.locator("[data-clip-player]");
  const scrollContainer = page.locator("[data-scroll-lock-container]");
  await expect(player).toHaveAttribute("data-locked", "true");
  await expect(scrollContainer).toHaveAttribute("data-scroll-locked", "true");

  await page.getByRole("button", { name: "Play" }).click();

  // Wait for the media element's own metadata to actually load before
  // touching `currentTime`/`duration` below — right after clicking play,
  // a slow first-compile can still leave `duration` as NaN for a moment.
  await expect
    .poll(() =>
      player.evaluate((el) => (el.querySelector("audio, video") as HTMLMediaElement).duration),
    )
    .toBeGreaterThan(0);

  // Locked: scrolling the feed container (the "pass" gesture, SPEC.md §3)
  // does nothing while clip 1 is under 5 seconds in.
  await scrollContainer.hover();
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(200);
  expect(await scrollContainer.evaluate((el) => el.scrollTop)).toBe(0);
  await page.screenshot({ path: resolve(shotsDir, "m5-01-mid-clip-locked.png") });

  // No-forward-seek defense: jump the media element's currentTime forward
  // directly, bypassing every UI control, and confirm the player's own
  // seek guard (clampSeekTarget) snaps it back down rather than letting it
  // stick.
  const beforeSeekAttempt = await player.evaluate(
    (el) => (el.querySelector("audio, video") as HTMLMediaElement).currentTime,
  );
  await player.evaluate((el) => {
    const media = el.querySelector("audio, video") as HTMLMediaElement;
    media.currentTime = media.duration - 0.5;
  });
  await page.waitForTimeout(300);
  const afterSeekAttempt = await player.evaluate(
    (el) => (el.querySelector("audio, video") as HTMLMediaElement).currentTime,
  );
  expect(afterSeekAttempt).toBeLessThan(beforeSeekAttempt + 2);

  // The lock releases on its own once 5 real timeline seconds have played
  // — no interaction needed, just let it keep playing.
  await expect(player).toHaveAttribute("data-locked", "false", { timeout: 20_000 });
  await expect(scrollContainer).toHaveAttribute("data-scroll-locked", "false");

  // Unlocked: the same gesture now actually moves to "the next candidate."
  await scrollContainer.hover();
  await page.mouse.wheel(0, 900);
  await expect.poll(() => scrollContainer.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await expect(page.getByTestId("next-candidate")).toBeVisible();
  await scrollContainer.evaluate((el) => el.scrollTo({ top: 0 }));

  // Hold-to-2x: playbackRate goes to 2 while held and back to 1 on
  // release — currentTime only ever advances by roughly the held wall
  // time, it's never jumped.
  const holdButton = page.locator("[data-hold-2x]");
  const holdBox = await holdButton.boundingBox();
  if (!holdBox) throw new Error("hold-to-2x button has no bounding box");
  const holdX = holdBox.x + holdBox.width / 2;
  const holdY = holdBox.y + holdBox.height / 2;

  const beforeHold = await player.evaluate(
    (el) => (el.querySelector("audio, video") as HTMLMediaElement).currentTime,
  );
  await page.mouse.move(holdX, holdY);
  await page.mouse.down();
  await expect
    .poll(() =>
      player.evaluate((el) => (el.querySelector("audio, video") as HTMLMediaElement).playbackRate),
    )
    .toBe(2);
  await page.waitForTimeout(1000);
  await page.mouse.up();
  await expect
    .poll(() =>
      player.evaluate((el) => (el.querySelector("audio, video") as HTMLMediaElement).playbackRate),
    )
    .toBe(1);
  const afterHold = await player.evaluate(
    (el) => (el.querySelector("audio, video") as HTMLMediaElement).currentTime,
  );
  expect(afterHold).toBeGreaterThan(beforeHold);
  // ~1s held at 2x plus surrounding overhead — nowhere near a jump to the
  // clip's end.
  expect(afterHold - beforeHold).toBeLessThan(5);

  // Hold 2x again to run the remainder of the clip out to `ended` without
  // a long real-time wait, then confirm completion is exactly what the
  // server reported back — never a locally-computed
  // currentTime >= duration check.
  await page.mouse.down();
  await expect(player).toHaveAttribute("data-completed", "true", { timeout: 30_000 });
  await page.mouse.up();

  await expect(page.getByText("Completed ✓")).toBeVisible();
  await expect(page.getByRole("button", { name: "Replay" })).toBeVisible();
  await page.screenshot({ path: resolve(shotsDir, "m5-02-post-completion.png") });
});
