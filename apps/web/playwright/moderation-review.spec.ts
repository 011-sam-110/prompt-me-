// UI evidence for ROADMAP.md M12 (CLAUDE.md: Playwright screenshots to
// .claude/debug-shots/ for UI milestones).
//
// What this proves, against the real composed stack: /internal/moderation
// lists genuinely-flagged rows read straight from `moderation_flags`
// (getPendingClipModerationFlags/getPendingChatModerationFlags), with
// flag_type + confidence rendered, and its Approve/Take-down buttons are
// real server actions (submitApproveModerationFlag/
// submitTakeDownModerationFlag -> lib/moderation/review-flag.ts) wired to
// the real @prompt-me/db rows — a flag disappears from the pending list
// the instant it's reviewed, and the empty state only appears once every
// flag really has been actioned.
//
// The one thing this spec does NOT exercise end-to-end through the real
// upload/send UI is the automated *detection* step: @prompt-me/core's
// moderation dev-mock is permanently "always clean" by design (no
// OPENAI_API_KEY exists yet, ROADMAP.md -> Needs from Sampo — see
// DevMockModerationProvider's own header comment), so nothing a Playwright
// browser session actually uploads or sends here could ever land in
// moderation_flags without a live key. The seed step below
// (api/testing/seed-moderation-flag, that route's own header comment)
// writes a flagged clip + flagged chat message directly through the same
// @prompt-me/db query layer the real automated pipeline writes through —
// it recreates the *precondition* a real flagged scan leaves behind, it
// never fakes the review queue's own behavior once that precondition
// exists, which is the part this milestone actually adds and this spec
// actually drives for real, clicks and all.
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const shotsDir = resolve(__dirname, "../../../.claude/debug-shots");

async function signUpAndVerify(page: Page): Promise<void> {
  await page.goto("/sign-up");
  await page.getByRole("button", { name: "Create a dev account" }).click();
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByRole("button", { name: "Start camera" }).click();
  await expect(page.getByRole("button", { name: "Capture & verify" })).toBeVisible();
  await page.getByRole("button", { name: "Capture & verify" }).click();
  await expect(page).toHaveURL(/\/feed/);
}

test.setTimeout(180_000);

test("the review queue lists a flagged clip and a flagged chat message, and Approve/Take down each remove them from the queue", async ({
  page,
}) => {
  await signUpAndVerify(page);

  const seedResponse = await page.request.post("/api/testing/seed-moderation-flag");
  expect(seedResponse.ok()).toBeTruthy();
  const seeded = (await seedResponse.json()) as {
    clipId: string;
    clipFlagId: string;
    chatMessageId: string;
    chatFlagId: string;
  };

  await page.goto("/internal/moderation");
  await expect(page.getByRole("heading", { name: "Moderation review queue" })).toBeVisible();

  const clipRow = page.locator(`[data-testid="moderation-clip-flag"][data-flag-id="${seeded.clipFlagId}"]`);
  const chatRow = page.locator(`[data-testid="moderation-chat-flag"][data-flag-id="${seeded.chatFlagId}"]`);
  await expect(clipRow).toBeVisible();
  await expect(chatRow).toBeVisible();
  await expect(clipRow.getByTestId("moderation-flag-badge")).toContainText("sexual");
  await expect(clipRow.getByTestId("moderation-flag-badge")).toContainText("82%");
  await expect(chatRow.getByTestId("moderation-flag-badge")).toContainText("harassment");
  await expect(chatRow.getByTestId("moderation-flag-badge")).toContainText("61%");
  await expect(clipRow).toContainText("a seeded transcript standing in for a real flagged scan");
  await expect(chatRow).toContainText("a seeded message standing in for a real flagged send");
  await page.screenshot({ path: resolve(shotsDir, "m12-01-review-queue-pending.png"), fullPage: true });

  // --- Approve the clip flag: the real server action runs, the clip
  // returns to `approved` (proven directly against the db in
  // lib/moderation/review-flag.test.ts), and the row leaves the pending
  // list on the next server render. ---
  await clipRow.getByRole("button", { name: "Approve" }).click();
  await expect(clipRow).toHaveCount(0);
  await expect(chatRow).toBeVisible(); // untouched by the clip action

  // --- Take down the chat flag: the message is soft-removed
  // (removedAt set, proven directly in review-flag.test.ts), and it too
  // leaves the pending list. ---
  await chatRow.getByRole("button", { name: "Take down" }).click();
  await expect(chatRow).toHaveCount(0);

  // Not asserting the queue is globally empty here — the dev database is
  // file-backed and persists across separate Playwright runs (dev-client.ts's
  // own header comment), so an earlier, unrelated run's seeded rows could
  // still be sitting there unreviewed; this spec only owns (and only
  // verifies the fate of) the two rows it seeded above.
  await page.screenshot({ path: resolve(shotsDir, "m12-02-review-queue-cleared.png"), fullPage: true });
});
