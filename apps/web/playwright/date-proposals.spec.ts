// UI evidence for the proposal half of ROADMAP.md M9 (CLAUDE.md: Playwright
// screenshots to .claude/debug-shots/ for UI milestones). Same
// sign-up -> verify -> upload -> watch-to-match setup as
// match-calendar.spec.ts (duplicated here rather than imported — every spec
// file in this directory is self-contained, same convention
// clip-stack-nav.spec.ts / player.spec.ts / verification.spec.ts already
// follow), then drives the actual propose/accept/decline/venue flow through
// two independent browser contexts.
//
// What this proves, against the real composed stack (no mocked proposal
// data, no GOOGLE_PLACES_API_KEY set so the dev-mock place list is what's
// actually exercised — playwright.config.ts's webServer env): a decline
// leaves the match intact and a fresh proposal still works (unlimited
// re-proposals, declining doesn't unmatch); an accepted proposal with no
// venue yet reads as "Accepted", never "Locked"; the venue picker has no
// free-text address field anywhere, only search + "Choose this venue"
// buttons over real search results; and choosing a venue is what actually
// flips the badge to "Locked" and shows the chosen place.
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

async function getMatchId(page: Page): Promise<string> {
  await page.goto("/matches");
  const matchLink = page.locator("[data-match-id]");
  await expect(matchLink).toHaveCount(1);
  const matchId = await matchLink.getAttribute("data-match-id");
  if (!matchId) throw new Error("no matchId on the matches list link");
  return matchId;
}

test.setTimeout(300_000);

test("propose/accept/decline with unlimited re-proposals, and a locked-only-with-a-venue meeting place", async ({
  browser,
}) => {
  const contextA = await browser.newContext({ permissions: ["camera"] });
  const contextB = await browser.newContext({ permissions: ["camera"] });
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  await signUpAndVerify(pageA);
  await signUpAndVerify(pageB);

  const clipA = await uploadOneClip(pageA, "M9 proposals fixture — A's clip");
  const clipB = await uploadOneClip(pageB, "M9 proposals fixture — B's clip");
  await watchClipToCompletion(pageA, clipB);
  await watchClipToCompletion(pageB, clipA);

  const matchId = await getMatchId(pageA);
  await pageA.goto(`/matches/${matchId}/calendar`);
  await expect(pageA.getByRole("heading", { name: "Plan a date" })).toBeVisible();

  // --- A proposes a first date ---
  const proposeFormA = pageA.locator('[data-testid="propose-date-form"]');
  await proposeFormA.getByLabel("Date idea").fill("Coffee at the corner café");
  await proposeFormA.getByLabel("Start").fill("2026-09-15T09:00");
  await proposeFormA.getByLabel("End").fill("2026-09-15T10:00");
  await proposeFormA.getByRole("button", { name: "Propose this date" }).click();

  const proposalListA = pageA.locator('[data-testid="date-proposal-list"]');
  await expect(proposalListA.locator("li")).toHaveCount(1);
  await expect(proposalListA.locator("li").first()).toHaveAttribute("data-proposal-status", "pending");
  // The proposer sees no Accept/Decline controls on their own proposal.
  await expect(proposalListA.locator("li").first().getByRole("button", { name: "Accept" })).toHaveCount(0);
  await pageA.screenshot({ path: resolve(shotsDir, "m9-05-a-proposes.png") });

  // --- B sees it and declines — this must NOT unmatch ---
  await pageB.goto(`/matches/${matchId}/calendar`);
  const proposalListB = pageB.locator('[data-testid="date-proposal-list"]');
  await expect(proposalListB.locator("li")).toHaveCount(1);
  await expect(proposalListB.locator("li").first()).toContainText("Coffee at the corner café");
  await pageB.screenshot({ path: resolve(shotsDir, "m9-06-b-sees-proposal.png") });

  await proposalListB.locator("li").first().getByRole("button", { name: "Decline" }).click();
  await expect(proposalListB.locator('li[data-proposal-status="declined"]')).toHaveCount(1);
  await pageB.screenshot({ path: resolve(shotsDir, "m9-07-b-declines.png") });

  // Declining doesn't unmatch: the pair is still on each other's matches list.
  await pageB.goto("/matches");
  await expect(pageB.locator("[data-match-id]")).toHaveCount(1);

  // --- Unlimited re-proposals: B proposes a fresh one on the same match ---
  await pageB.goto(`/matches/${matchId}/calendar`);
  const proposeFormB = pageB.locator('[data-testid="propose-date-form"]');
  await proposeFormB.getByLabel("Date idea").fill("Riverside Museum this time");
  await proposeFormB.getByLabel("Start").fill("2026-09-16T13:00");
  await proposeFormB.getByLabel("End").fill("2026-09-16T15:00");
  await proposeFormB.getByRole("button", { name: "Propose this date" }).click();
  await expect(proposalListB.locator('li[data-proposal-status="pending"]')).toHaveCount(1);
  // The declined one is still there too — a full history, not overwritten.
  await expect(proposalListB.locator("li")).toHaveCount(2);

  // --- A accepts the new one — idea + slot only, no venue yet ---
  await pageA.goto(`/matches/${matchId}/calendar`);
  const pendingRowA = proposalListA.locator('li[data-proposal-status="pending"]');
  await expect(pendingRowA).toHaveCount(1);
  await pendingRowA.getByRole("button", { name: "Accept" }).click();

  const acceptedRowA = proposalListA.locator('li[data-proposal-status="accepted"]');
  await expect(acceptedRowA).toHaveCount(1);
  // The actual ROADMAP.md M9 assertion, visible in the real UI: accepted
  // idea+slot with no venue chosen yet reads as NOT locked.
  await expect(acceptedRowA).toHaveAttribute("data-proposal-locked", "false");
  await expect(acceptedRowA.locator('[data-testid="proposal-status-badge"]')).toHaveText("Accepted — choosing a place");
  await expect(acceptedRowA.locator('[data-testid="proposal-status-badge"]')).not.toHaveText("Locked");
  await pageA.screenshot({ path: resolve(shotsDir, "m9-08-accepted-not-locked.png") });

  // --- The venue picker itself: no free-text address field anywhere ---
  const venuePicker = acceptedRowA.locator('[data-testid="venue-picker"]');
  await expect(venuePicker).toBeVisible();
  expect(await venuePickerHasOnlyTheSearchField(venuePicker)).toBe(true);

  // Real search against the dev-mock place list (no GOOGLE_PLACES_API_KEY
  // in this test env — playwright.config.ts's webServer env) — restricted
  // to public-venue types only.
  await venuePicker.getByLabel("Search public venues").fill("museum");
  await venuePicker.getByRole("button", { name: "Search" }).click();
  const results = venuePicker.locator('[data-testid="venue-picker-results"] li');
  await expect(results).toHaveCount(1);
  await expect(results.first()).toContainText("Riverside Museum");
  await pageA.screenshot({ path: resolve(shotsDir, "m9-09-venue-search-results.png") });

  await results.first().getByRole("button", { name: "Choose this venue" }).click();

  // --- Locked: idea + slot + venue all agreed together ---
  const lockedRowA = proposalListA.locator('li[data-proposal-locked="true"]');
  await expect(lockedRowA).toHaveCount(1);
  await expect(lockedRowA.locator('[data-testid="proposal-status-badge"]')).toHaveText("Locked");
  await expect(lockedRowA).toContainText("Riverside Museum");
  await pageA.screenshot({ path: resolve(shotsDir, "m9-10-locked-with-venue.png") });

  // B's independent session sees the exact same locked state on reload.
  await pageB.goto(`/matches/${matchId}/calendar`);
  const lockedRowB = proposalListB.locator('li[data-proposal-locked="true"]');
  await expect(lockedRowB).toHaveCount(1);
  await expect(lockedRowB).toContainText("Riverside Museum");
  await pageB.screenshot({ path: resolve(shotsDir, "m9-11-b-sees-locked.png") });
});

/** True iff the venue picker renders no free-text address input — only its
 * one labeled "Search public venues" text field (a name/category search,
 * not an address) and buttons. ROADMAP.md M9: "NO free-text address field
 * that could bypass it." */
async function venuePickerHasOnlyTheSearchField(
  venuePicker: import("@playwright/test").Locator,
): Promise<boolean> {
  const textInputs = venuePicker.locator('input[type="text"], input:not([type])');
  const count = await textInputs.count();
  if (count !== 1) return false;
  const ariaLabel = await textInputs.first().getAttribute("aria-label");
  return ariaLabel === "Search public venues";
}
