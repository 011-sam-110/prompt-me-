// UI evidence for ROADMAP.md M11's realtime half (CLAUDE.md: Playwright
// screenshots to .claude/debug-shots/ for UI milestones). Same
// sign-up -> verify -> upload -> watch-to-match setup as
// date-proposals.spec.ts / match-calendar.spec.ts (duplicated here rather
// than imported — every spec file in this directory is self-contained,
// same convention those files already follow), then drives a real locked
// date all the way through to two independent browser contexts messaging
// each other live in the chat window.
//
// What this proves, against the real composed stack (no PUSHER_* set in
// playwright.config.ts's webServer env, so @prompt-me/core's
// getRealtimeProvider() resolves to the in-memory dev-mock throughout —
// the SSE route at api/chat/subscribe/[chatWindowId] is the transport
// actually exercised here): a message A sends appears on B's already-open
// page — no reload, no polling from the test itself — within a tight
// timeout, proving genuine push delivery rather than "eventually true
// after a refresh"; the reverse direction works too; and locking a SECOND
// date on the same match opens a genuinely fresh chat_windows row — a
// different id, an empty message history (none of window one's messages
// leak in), and independently correct T-60min gating (window two, whose
// date is further out, correctly reads as not-yet-open while window one
// stays open).
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

/** datetime-local's value has no timezone marker, so the browser parses it
 * as local wall-clock time — matching that exactly (rather than an ISO/UTC
 * string) is what makes the resulting slotStartAt land where THIS test
 * actually intends relative to the real `now` it was computed from,
 * regardless of the machine's timezone. */
function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Proposes, accepts, and venues a date on an already-matched pair — same
 * three-step flow date-proposals.spec.ts's own test drives through the UI
 * — then returns the chat_windows id the lock created, read straight off
 * the "Open chat" link's own data attribute
 * (components/date-proposals/proposal-list.tsx) rather than a direct DB
 * query, so this proves get-match-proposals.ts's chatWindowId resolution
 * end-to-end too. `ideaText` must be unique across calls in a single test
 * so the right row can be found regardless of the newest-first list order.
 */
async function lockDateAndGetChatWindowId(
  proposerPage: Page,
  responderPage: Page,
  matchId: string,
  ideaText: string,
  slotStartAt: Date,
): Promise<string> {
  await proposerPage.goto(`/matches/${matchId}/calendar`);
  const proposeForm = proposerPage.locator('[data-testid="propose-date-form"]');
  await proposeForm.getByLabel("Date idea").fill(ideaText);
  await proposeForm.getByLabel("Start").fill(toDatetimeLocalValue(slotStartAt));
  await proposeForm.getByLabel("End").fill(toDatetimeLocalValue(new Date(slotStartAt.getTime() + 60 * 60 * 1000)));
  await proposeForm.getByRole("button", { name: "Propose this date" }).click();

  // Wait out the async server-action round trip on the PROPOSER's own page
  // before ever navigating the responder's — that page is a fresh
  // server-rendered navigation with no live re-fetch (same as
  // match-calendar.spec.ts's own pages), so visiting it before the
  // proposal has actually landed would see zero rows forever, not
  // eventually catch up. Mirrors date-proposals.spec.ts's own test, which
  // confirms on the proposer's side before ever switching to the
  // responder's.
  const proposerRow = proposerPage.locator('[data-testid="date-proposal-list"] li', { hasText: ideaText });
  await expect(proposerRow).toHaveCount(1);

  await responderPage.goto(`/matches/${matchId}/calendar`);
  const responderRow = responderPage.locator('[data-testid="date-proposal-list"] li', { hasText: ideaText });
  await expect(responderRow).toHaveCount(1);
  await responderRow.getByRole("button", { name: "Accept" }).click();
  await expect(responderRow).toHaveAttribute("data-proposal-status", "accepted");

  const venuePicker = responderRow.locator('[data-testid="venue-picker"]');
  await expect(venuePicker).toBeVisible();
  await venuePicker.getByLabel("Search public venues").fill("café");
  await venuePicker.getByRole("button", { name: "Search" }).click();
  const firstResult = venuePicker.locator('[data-testid="venue-picker-results"] li').first();
  await expect(firstResult).toBeVisible();
  await firstResult.getByRole("button", { name: "Choose this venue" }).click();

  await expect(responderRow).toHaveAttribute("data-proposal-locked", "true");
  const chatLink = responderRow.locator('[data-testid="open-chat-link"]');
  await expect(chatLink).toBeVisible();
  const chatWindowId = await chatLink.getAttribute("data-chat-window-id");
  if (!chatWindowId) throw new Error(`no chatWindowId on the "Open chat" link for proposal "${ideaText}"`);
  return chatWindowId;
}

// A heavier flow than the other specs in this directory (two full
// sign-up/verify/upload/watch cycles AND two propose/accept/venue lock
// cycles on one match) — playwright.config.ts's own `expect.timeout` was
// bumped to 90s on this same date for the machine-load reasons its comment
// documents; this test's own overall budget needs equivalent headroom for
// several such steps to land back-to-back.
test.setTimeout(600_000);

test("messages deliver live between two open chat windows, and locking a second date opens a fresh window", async ({
  browser,
}) => {
  const contextA = await browser.newContext({ permissions: ["camera"] });
  const contextB = await browser.newContext({ permissions: ["camera"] });
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  await signUpAndVerify(pageA);
  await signUpAndVerify(pageB);

  const clipA = await uploadOneClip(pageA, "M11 chat fixture — A's clip");
  const clipB = await uploadOneClip(pageB, "M11 chat fixture — B's clip");
  await watchClipToCompletion(pageA, clipB);
  await watchClipToCompletion(pageB, clipA);

  const matchId = await getMatchId(pageA);

  // --- Date one: a few minutes from now, so opens_at (slotStart - 60min)
  // is already in the past — the window is open the instant it's created,
  // with no need for this test to wait around for a real-time clock
  // boundary before it can start messaging.
  const now = Date.now();
  const slotStart1 = new Date(now + 3 * 60 * 1000);
  const chatWindowId1 = await lockDateAndGetChatWindowId(pageA, pageB, matchId, "M11 first date — coffee", slotStart1);

  await pageA.goto(`/matches/${matchId}/chat/${chatWindowId1}`);
  await pageB.goto(`/matches/${matchId}/chat/${chatWindowId1}`);

  const chatA = pageA.locator('[data-testid="chat-window"]');
  const chatB = pageB.locator('[data-testid="chat-window"]');
  await expect(chatA).toHaveAttribute("data-chat-window-status", "allowed");
  await expect(chatB).toHaveAttribute("data-chat-window-status", "allowed");
  await expect(chatA.locator('[data-testid="chat-message-list"] li')).toHaveCount(0);

  // --- A sends; B's already-open page (no reload, no manual poll from
  // this test) picks it up live within a tight timeout.
  await chatA.getByLabel("Message").fill("Hey! Really looking forward to this.");
  await chatA.getByRole("button", { name: "Send" }).click();
  await expect(chatA.locator('li[data-message-sender="self"]')).toHaveCount(1);

  const bReceivedFromA = chatB.locator('li[data-message-sender="other"]', { hasText: "Really looking forward to this" });
  await expect(bReceivedFromA).toBeVisible({ timeout: 8_000 });
  await pageB.screenshot({ path: resolve(shotsDir, "m11-01-b-receives-live.png") });

  // --- The reverse direction: B replies, A's page picks it up live.
  await chatB.getByLabel("Message").fill("Me too — see you there!");
  await chatB.getByRole("button", { name: "Send" }).click();
  await expect(chatB.locator('li[data-message-sender="self"]')).toHaveCount(1);

  const aReceivedFromB = chatA.locator('li[data-message-sender="other"]', { hasText: "see you there" });
  await expect(aReceivedFromB).toBeVisible({ timeout: 8_000 });
  await pageA.screenshot({ path: resolve(shotsDir, "m11-02-a-receives-live.png") });

  // Both sides now show both messages, in order — the sender's own POST
  // response and the realtime echo of that same message were correctly
  // deduped, not shown twice.
  await expect(chatA.locator('[data-testid="chat-message-list"] li')).toHaveCount(2);
  await expect(chatB.locator('[data-testid="chat-message-list"] li')).toHaveCount(2);

  // --- Lock a SECOND date on the same match, further out (T-60min still
  // ahead of now) — ROADMAP.md M11's third acceptance bullet: this must
  // open a genuinely fresh chat_windows row.
  const slotStart2 = new Date(now + 90 * 60 * 1000);
  const chatWindowId2 = await lockDateAndGetChatWindowId(
    pageB,
    pageA,
    matchId,
    "M11 second date — museum",
    slotStart2,
  );
  expect(chatWindowId2).not.toBe(chatWindowId1);

  await pageA.goto(`/matches/${matchId}/chat/${chatWindowId2}`);
  const chatA2 = pageA.locator('[data-testid="chat-window"]');

  // Fresh: no bleed of window one's two messages into window two.
  await expect(chatA2.locator('[data-testid="chat-message-list"] li')).toHaveCount(0);
  // T-60min correctly re-derived for THIS window's own, later date — still
  // not open yet (unlike window one, which stayed open throughout).
  await expect(chatA2).toHaveAttribute("data-chat-window-status", "not_yet_open");
  await expect(chatA2.locator('[data-testid="chat-status-message"]')).toContainText("This chat opens");
  await pageA.screenshot({ path: resolve(shotsDir, "m11-03-fresh-window-not-yet-open.png") });

  // Window one, revisited, is completely unaffected by window two existing
  // — still open, still holding exactly its own two messages.
  await pageA.goto(`/matches/${matchId}/chat/${chatWindowId1}`);
  const chatA1Again = pageA.locator('[data-testid="chat-window"]');
  await expect(chatA1Again).toHaveAttribute("data-chat-window-status", "allowed");
  await expect(chatA1Again.locator('[data-testid="chat-message-list"] li')).toHaveCount(2);
});
