// UI evidence for ROADMAP.md M10 (CLAUDE.md: Playwright screenshots to
// .claude/debug-shots/ for UI milestones). Same sign-up -> verify -> upload
// -> watch-to-match setup as date-proposals.spec.ts (duplicated here rather
// than imported — every spec file in this directory is self-contained,
// same convention that file's own header comment describes).
//
// What this proves, against the real composed stack: no ANTHROPIC_API_KEY
// is set in playwright.config.ts's webServer env, so the generated-ideas
// panel is driven by get-provider.ts's dev-mock branch — the exact same
// "fully clickable with zero real credentials" path documented in
// .env.example. It shows exactly two generated ideas, each with a visible
// rationale and a [DEV MOCK] marker (unmistakably fake, per ROADMAP.md
// M10); that a generated idea can be proposed and then responds through the
// same accept flow M9 already covers; and that "Suggest new ideas" replaces
// the pair with a fresh one rather than appending to it.
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

test("generated ideas render on first visit (dev-mock), one can be proposed, and 'suggest new ideas' regenerates the pair", async ({
  browser,
}) => {
  const contextA = await browser.newContext({ permissions: ["camera"] });
  const contextB = await browser.newContext({ permissions: ["camera"] });
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  await signUpAndVerify(pageA);
  await signUpAndVerify(pageB);

  const clipA = await uploadOneClip(pageA, "M10 ideas fixture — A loves hiking and terrible puns");
  const clipB = await uploadOneClip(pageB, "M10 ideas fixture — B is a coffee snob");
  await watchClipToCompletion(pageA, clipB);
  await watchClipToCompletion(pageB, clipA);

  const matchId = await getMatchId(pageA);
  await pageA.goto(`/matches/${matchId}/calendar`);
  await expect(pageA.getByRole("heading", { name: "Plan a date" })).toBeVisible();

  // --- Exactly two generated ideas render on first visit, each with a
  // visible, unmistakably-fake rationale (no ANTHROPIC_API_KEY in this test
  // env -> get-provider.ts's dev-mock branch). ---
  const ideasPanel = pageA.locator('[data-testid="generated-ideas-panel"]');
  const ideaCards = ideasPanel.locator('[data-testid="generated-ideas-list"] li');
  await expect(ideaCards).toHaveCount(2);
  await expect(ideaCards.first()).toContainText("[DEV MOCK]");
  await pageA.screenshot({ path: resolve(shotsDir, "m10-01-generated-ideas.png") });

  const firstIdeaId = await ideaCards.first().getAttribute("data-idea-id");
  const secondIdeaId = await ideaCards.nth(1).getAttribute("data-idea-id");

  // --- B sees the identical cached pair (same idea ids), not a freshly
  // regenerated one — ROADMAP.md M10: "not regenerated per proposal." ---
  await pageB.goto(`/matches/${matchId}/calendar`);
  const ideaCardsB = pageB.locator('[data-testid="generated-ideas-list"] li');
  await expect(ideaCardsB).toHaveCount(2);
  await expect(ideaCardsB.first()).toHaveAttribute("data-idea-id", firstIdeaId!);
  await expect(ideaCardsB.nth(1)).toHaveAttribute("data-idea-id", secondIdeaId!);

  // --- A proposes the first generated idea directly (selectable alongside
  // a custom one) ---
  const firstCardA = ideaCards.first();
  const proposeFormA = firstCardA.locator('[data-testid="generated-idea-propose-form"]');
  await proposeFormA.getByLabel("Start").fill("2026-09-15T09:00");
  await proposeFormA.getByLabel("End").fill("2026-09-15T10:00");
  await proposeFormA.getByRole("button", { name: "Propose this idea" }).click();

  const proposalListA = pageA.locator('[data-testid="date-proposal-list"]');
  await expect(proposalListA.locator("li")).toHaveCount(1);
  await expect(proposalListA.locator("li").first()).toHaveAttribute("data-proposal-status", "pending");
  await pageA.screenshot({ path: resolve(shotsDir, "m10-02-proposed-generated-idea.png") });

  // --- B sees the proposal, wording matches the generated idea's own text,
  // and can accept it exactly like a custom proposal (M9's flow, unchanged) ---
  await pageB.goto(`/matches/${matchId}/calendar`);
  const proposalListB = pageB.locator('[data-testid="date-proposal-list"]');
  await expect(proposalListB.locator("li")).toHaveCount(1);
  const proposedText = await firstCardA.locator("p.font-medium").innerText();
  await expect(proposalListB.locator("li").first()).toContainText(proposedText);
  await proposalListB.locator("li").first().getByRole("button", { name: "Accept" }).click();
  await expect(proposalListB.locator('li[data-proposal-status="accepted"]')).toHaveCount(1);
  await pageB.screenshot({ path: resolve(shotsDir, "m10-03-generated-idea-accepted.png") });

  // --- "Suggest new ideas" forces regeneration: a fresh pair replaces the
  // cached one (different ids), not appended alongside it. ---
  await pageA.goto(`/matches/${matchId}/calendar`);
  await ideasPanel.getByTestId("suggest-new-ideas-button").click();
  await expect(ideaCards).toHaveCount(2);
  await expect
    .poll(async () => ideaCards.first().getAttribute("data-idea-id"))
    .not.toBe(firstIdeaId);
  const regeneratedFirstId = await ideaCards.first().getAttribute("data-idea-id");
  const regeneratedSecondId = await ideaCards.nth(1).getAttribute("data-idea-id");
  expect([regeneratedFirstId, regeneratedSecondId]).not.toContain(firstIdeaId);
  expect([regeneratedFirstId, regeneratedSecondId]).not.toContain(secondIdeaId);
  await pageA.screenshot({ path: resolve(shotsDir, "m10-04-suggested-new-ideas.png") });
});
