// UI evidence for ROADMAP.md M2 (CLAUDE.md: Playwright screenshots to
// .claude/debug-shots/ for UI milestones). Runs against the dev server
// with no Clerk/DB credentials at all (see playwright.config.ts's
// webServer.env) — exercises the dev-mode auth stub end to end: landing
// -> dev sign-up -> a real `users` row created -> onboarding gate blocks
// /feed until verification_status = passed (which M3 will set; nothing
// here fakes that).
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const shotsDir = resolve(__dirname, "../../../.claude/debug-shots");

test("dev-mode sign-up creates an account and the onboarding gate blocks /feed", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Prompt Me" })).toBeVisible();
  await page.screenshot({ path: resolve(shotsDir, "m2-01-landing.png") });

  await page.getByRole("link", { name: "Get started" }).click();
  await expect(page).toHaveURL(/\/sign-up/);
  await expect(page.getByText("Dev-mode auth")).toBeVisible();
  await page.screenshot({ path: resolve(shotsDir, "m2-02-dev-sign-up.png") });

  await page.getByRole("button", { name: "Create a dev account" }).click();
  await expect(page).toHaveURL(/\/onboarding/);
  await expect(
    page.getByRole("heading", { name: "One more step before your feed unlocks" }),
  ).toBeVisible();
  await page.screenshot({ path: resolve(shotsDir, "m2-03-onboarding-blocked.png") });

  // The gate is server-side, not just a missing nav link: hitting /feed
  // directly still bounces back to /onboarding.
  await page.goto("/feed");
  await expect(page).toHaveURL(/\/onboarding/);
  await page.screenshot({ path: resolve(shotsDir, "m2-04-feed-redirects-to-onboarding.png") });
});

test("signing back in with a dev account id returns to the same account's onboarding state", async ({
  page,
}) => {
  await page.goto("/sign-up");
  await page.getByRole("button", { name: "Create a dev account" }).click();
  await expect(page).toHaveURL(/\/onboarding/);

  // Recover the dev account id this session was signed into.
  const cookies = await page.context().cookies();
  const devCookie = cookies.find((c) => c.name === "prompt_me_dev_clerk_id");
  expect(devCookie?.value).toBeTruthy();
  const clerkId = devCookie!.value;

  // Sign out, then sign back in with the same dev id.
  await page.context().clearCookies();
  await page.goto("/sign-in");
  await page.getByLabel("Sign back in with a dev account id").fill(clerkId);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/onboarding/);
  await expect(
    page.getByRole("heading", { name: "One more step before your feed unlocks" }),
  ).toBeVisible();
});
