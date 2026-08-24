// UI evidence for ROADMAP.md M3 (CLAUDE.md: Playwright screenshots to
// .claude/debug-shots/ for UI milestones). Runs against the dev server
// with no Clerk/DB/Didit credentials at all (playwright.config.ts's
// webServer.env) — exercises the dev-mode auth stub (M2) through the real
// selfie-capture flow (M3), landing on the dev-mock verification provider
// (ROADMAP.md M3: "used automatically when no Didit key configured") since
// no Didit key is set either. Chromium's fake camera device stands in for
// real hardware (playwright.config.ts's launchOptions).
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const shotsDir = resolve(__dirname, "../../../.claude/debug-shots");

test("selfie capture runs the dev-mock verification check and unlocks the feed", async ({ page }) => {
  await page.goto("/sign-up");
  await page.getByRole("button", { name: "Create a dev account" }).click();
  await expect(page).toHaveURL(/\/onboarding/);
  await expect(
    page.getByRole("heading", { name: "One more step before your feed unlocks" }),
  ).toBeVisible();
  await page.screenshot({ path: resolve(shotsDir, "m3-01-onboarding-pre-capture.png") });

  await page.getByRole("button", { name: "Start camera" }).click();
  await expect(page.getByRole("button", { name: "Capture & verify" })).toBeVisible();
  await page.screenshot({ path: resolve(shotsDir, "m3-02-camera-ready.png") });

  await page.getByRole("button", { name: "Capture & verify" }).click();

  // The dev-mock always passes (ROADMAP.md M3) — the onboarding page's own
  // server-side gate then redirects to /feed exactly like M2's gate did
  // once verification_status flips to passed.
  await expect(page).toHaveURL(/\/feed/);
  await expect(page.getByRole("heading", { name: "You're verified" })).toBeVisible();
  await page.screenshot({ path: resolve(shotsDir, "m3-03-feed-unlocked.png") });
});
