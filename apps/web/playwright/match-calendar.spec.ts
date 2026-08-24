// UI evidence for the calendar half of ROADMAP.md M9 (CLAUDE.md: Playwright
// screenshots to .claude/debug-shots/ for UI milestones). Two independent
// dev accounts (two browser contexts, so each gets its own dev-session
// cookie — mirrors clip-stack-nav.spec.ts's single-user upload trick, just
// duplicated across two people) are driven through the real path to a
// match — sign-up, verification, one uploaded clip each, then watching the
// *other* side's clip out to server-reported completion via hold-to-2x
// (player.spec.ts's technique) — since ENGINEERING_SPEC §7's mutual-
// completion match only fires once both directions are done. Only then does
// /matches/[matchId]/calendar even exist to visit: SPEC.md §6's "visible to
// a match once planning starts."
//
// What this proves, against the real composed stack (no mocked calendar
// data): the calendar page is unreachable before a match exists (a bare
// signed-in user has no matches at all, so there's nothing to click into);
// each side's own calendar is editable and the other side's is read-only,
// on the SAME matchId, from two independent sessions; a slot one side adds
// becomes visible in the other side's browser on a fresh load — the actual
// "visible to a match" guarantee, not just "the query returns rows" in
// isolation; and the overlap guard (packages/core/src/calendar/slots.ts) is
// enforced through the real form, not just in the composition-layer tests.
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

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

async function signUpAndVerify(page: Page): Promise<void> {
  await page.goto("/sign-up");
  await page.getByRole("button", { name: "Create a dev account" }).click();
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByRole("button", { name: "Start camera" }).click();
  await expect(page.getByRole("button", { name: "Capture & verify" })).toBeVisible();
  await page.getByRole("button", { name: "Capture & verify" }).click();
  await expect(page).toHaveURL(/\/feed/);
}

async function uploadOneClip(page: Page, label: string): Promise<string> {
  const uploadResponse = await page.request.post("/api/clips", {
    multipart: {
      file: { name: "clip.wav", mimeType: "audio/wav", buffer: makeWavFixture(15) },
      tier: "1",
      customPromptText: label,
    },
  });
  expect(uploadResponse.ok()).toBeTruthy();
  const { clip } = await uploadResponse.json();
  return clip.id as string;
}

/** Watches a clip out to real, server-reported completion via hold-to-2x — same mechanism player.spec.ts proves. */
async function watchClipToCompletion(page: Page, clipId: string): Promise<void> {
  await page.goto(`/clips/${clipId}`);
  await expect(page.getByRole("heading", { name: "Clip playback" })).toBeVisible();

  const player = page.locator("[data-clip-player]");
  await page.getByRole("button", { name: "Play" }).click();
  await expect
    .poll(() => player.evaluate((el) => (el.querySelector("audio, video") as HTMLMediaElement).duration))
    .toBeGreaterThan(0);

  const holdButton = page.locator("[data-hold-2x]");
  const box = await holdButton.boundingBox();
  if (!box) throw new Error("hold-to-2x button has no bounding box");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(player).toHaveAttribute("data-completed", "true", { timeout: 30_000 });
  await page.mouse.up();
}

test.setTimeout(300_000);

test("busy/available calendar is editable for self, read-only for the match, and only reachable once matched", async ({
  browser,
}) => {
  const contextA = await browser.newContext({ permissions: ["camera"] });
  const contextB = await browser.newContext({ permissions: ["camera"] });
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  await signUpAndVerify(pageA);
  await signUpAndVerify(pageB);

  // Before any match exists, the matches list is genuinely empty — this
  // page never fabricates a plannable pair.
  await pageA.goto("/matches");
  await expect(pageA.getByRole("heading", { name: "Your matches" })).toBeVisible();
  await expect(pageA.locator("[data-match-id]")).toHaveCount(0);

  const clipA = await uploadOneClip(pageA, "M9 calendar fixture — A's clip");
  const clipB = await uploadOneClip(pageB, "M9 calendar fixture — B's clip");

  // A completes B's clip, then B completes A's — ENGINEERING_SPEC §7's
  // match fires on whichever direction closes the loop, here B's.
  await watchClipToCompletion(pageA, clipB);
  await watchClipToCompletion(pageB, clipA);

  await pageA.goto("/matches");
  const matchLink = pageA.locator("[data-match-id]");
  await expect(matchLink).toHaveCount(1);
  const matchId = await matchLink.getAttribute("data-match-id");
  await pageA.screenshot({ path: resolve(shotsDir, "m9-01-matches-list.png") });

  await matchLink.click();
  await expect(pageA).toHaveURL(new RegExp(`/matches/${matchId}/calendar`));
  await expect(pageA.getByRole("heading", { name: "Plan a date" })).toBeVisible();

  const ownSlotsA = pageA.locator('[data-testid="own-calendar-slots"]');
  const partnerSlotsA = pageA.locator('[data-testid="partner-calendar-slots"]');
  await expect(partnerSlotsA).toContainText("They haven't added any times yet.");

  // Add a busy slot to A's own calendar (default status is "busy" — see
  // OwnCalendarEditor's initial state).
  await pageA.getByLabel("Start").fill("2026-09-10T09:00");
  await pageA.getByLabel("End").fill("2026-09-10T10:00");
  await pageA.getByRole("button", { name: "Add to calendar" }).click();
  await expect(ownSlotsA.locator("li")).toHaveCount(1);
  await expect(ownSlotsA.locator("li")).toHaveAttribute("data-slot-status", "busy");

  // The overlap guard (packages/core/src/calendar/slots.ts), through the
  // real form: a second, overlapping range is rejected and never added.
  await pageA.getByLabel("Start").fill("2026-09-10T09:30");
  await pageA.getByLabel("End").fill("2026-09-10T11:00");
  await pageA.getByRole("button", { name: "Add to calendar" }).click();
  // Scoped to the add-slot form's own alert — Next.js's route announcer
  // (#__next-route-announcer__) also carries role="alert" and would
  // otherwise make this locator ambiguous.
  await expect(pageA.locator('form p[role="alert"]')).toContainText("overlap");
  await expect(ownSlotsA.locator("li")).toHaveCount(1);

  await pageA.screenshot({ path: resolve(shotsDir, "m9-02-own-calendar-editable.png") });

  // B visits the SAME match's calendar from an entirely independent
  // session: A's slot shows up read-only on B's side, and B can add their
  // own without touching A's.
  await pageB.goto(`/matches/${matchId}/calendar`);
  await expect(pageB.getByRole("heading", { name: "Plan a date" })).toBeVisible();

  const ownSlotsB = pageB.locator('[data-testid="own-calendar-slots"]');
  const partnerSlotsB = pageB.locator('[data-testid="partner-calendar-slots"]');
  await expect(partnerSlotsB.locator("li")).toHaveCount(1);
  await expect(partnerSlotsB.locator("li")).toHaveAttribute("data-slot-status", "busy");
  // Read-only: no "Remove" control on the partner's own entries.
  await expect(partnerSlotsB.locator("button", { hasText: "Remove" })).toHaveCount(0);

  await pageB.getByLabel("Start").fill("2026-09-11T14:00");
  await pageB.getByLabel("End").fill("2026-09-11T15:00");
  await pageB.getByRole("radio", { name: "Available" }).check();
  await pageB.getByRole("button", { name: "Add to calendar" }).click();
  await expect(ownSlotsB.locator("li")).toHaveCount(1);
  await expect(ownSlotsB.locator("li")).toHaveAttribute("data-slot-status", "available");

  await pageB.screenshot({ path: resolve(shotsDir, "m9-03-partner-view-and-own-add.png") });

  // Back on A's side, a fresh load shows B's just-added slot too — the
  // visibility is mutual and server-driven, not a one-way read.
  await pageA.goto(`/matches/${matchId}/calendar`);
  await expect(partnerSlotsA.locator("li")).toHaveCount(1);
  await expect(partnerSlotsA.locator("li")).toHaveAttribute("data-slot-status", "available");
  await expect(pageA.locator('[data-testid="own-calendar-slots"] li')).toHaveCount(1);

  await pageA.screenshot({ path: resolve(shotsDir, "m9-04-mutual-visibility.png") });
});
