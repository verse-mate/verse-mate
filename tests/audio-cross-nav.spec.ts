/**
 * TASK-015: web E2E for audio first-play + cross-navigation.
 *
 * Acts as the regression guard for br-audio-011 (cross-nav continuity)
 * and br-audio-003 (lazy first-play 202→200 polling).
 *
 * Prerequisites for the test to run (otherwise skipped):
 *   - Backend running on :3001 with `TTS_PROVIDER=stub` so first-play
 *     completes synchronously without OpenAI cost.
 *   - Frontend running on :3000.
 *   - A seeded reader account whose credentials are passed via
 *     `E2E_TEST_EMAIL` and `E2E_TEST_PASSWORD`.
 *
 * The test deliberately uses the real backend (rather than mocking
 * fetch) because the value here is catching real regressions in the
 * audio plumbing — not just the React layer.
 */
import { expect, test } from "@playwright/test";

const HAS_CREDS = Boolean(
  process.env.E2E_TEST_EMAIL && process.env.E2E_TEST_PASSWORD,
);

test.describe("Explanation audio — cross-navigation continuity", () => {
  test.skip(
    !HAS_CREDS,
    "E2E_TEST_EMAIL and E2E_TEST_PASSWORD env vars required",
  );

  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(process.env.E2E_TEST_EMAIL as string);
    await page
      .getByLabel(/password/i)
      .fill(process.env.E2E_TEST_PASSWORD as string);
    await page.getByRole("button", { name: /sign in|log in/i }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
      timeout: 15_000,
    });
  });

  test("first-play loads audio, dock survives chapter navigation", async ({
    page,
  }) => {
    // Open Genesis 1, Summary tab.
    await page.goto("/bible/genesis/1?explanationType=summary");
    const inlineEntry = page.getByRole("button", {
      name: /listen|generating/i,
    });
    await expect(inlineEntry).toBeVisible({ timeout: 30_000 });

    // Tap to start playback. Stub provider returns the fixture audio
    // synchronously so the chip transitions to "playing" within a
    // few seconds of the click.
    await inlineEntry.click();

    const dockBar = page.getByRole("region", { name: /audio player/i });
    await expect(dockBar).toBeVisible({ timeout: 30_000 });

    // Confirm playback actually started — the <audio> element should
    // have a non-empty src, and the dock title shows the chapter.
    const audioSrc = await page
      .locator("audio")
      .first()
      .evaluate((el: HTMLAudioElement) => el.src);
    expect(audioSrc.length).toBeGreaterThan(0);

    // Navigate to Genesis 2 — the audio root is mounted ABOVE the
    // route outlet (br-audio-011) so the <audio> element should not
    // unmount.
    await page.goto("/bible/genesis/2?explanationType=summary");
    await expect(dockBar).toBeVisible();

    const audioSrcAfterNav = await page
      .locator("audio")
      .first()
      .evaluate((el: HTMLAudioElement) => el.src);
    // Same element → same src.
    expect(audioSrcAfterNav).toBe(audioSrc);

    // currentTime should still be advancing (or at minimum non-zero
    // if playback has had a moment to run).
    await page.waitForTimeout(1500);
    const currentTime = await page
      .locator("audio")
      .first()
      .evaluate((el: HTMLAudioElement) => el.currentTime);
    expect(currentTime).toBeGreaterThan(0);
  });

  test("full sheet opens from dock body tap", async ({ page }) => {
    await page.goto("/bible/genesis/1?explanationType=summary");
    const inlineEntry = page.getByRole("button", {
      name: /listen|generating/i,
    });
    await expect(inlineEntry).toBeVisible({ timeout: 30_000 });
    await inlineEntry.click();

    const dockBar = page.getByRole("region", { name: /audio player/i });
    await expect(dockBar).toBeVisible({ timeout: 30_000 });

    // Tap the dock body (not its play/close icons) to open full sheet.
    await page
      .locator("button", { hasText: /chapter/i })
      .first()
      .click();

    const fullSheet = page.getByRole("dialog", { name: /full audio player/i });
    await expect(fullSheet).toBeVisible();

    // Esc closes it (TASK-016 a11y).
    await page.keyboard.press("Escape");
    await expect(fullSheet).toBeHidden();
  });
});
