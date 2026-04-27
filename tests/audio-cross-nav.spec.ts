/**
 * TASK-015: web E2E for the audio plumbing.
 *
 * Acts as the regression guard for:
 *   - br-audio-003 — lazy first-play (202→200 polling in stub mode)
 *   - br-audio-007 — Reader DTO shape (audio object with url field)
 *   - TASK-016 a11y — Esc closes the full sheet
 *
 * Cross-nav continuity (br-audio-011) is NOT tested end-to-end here —
 * `page.goto()` is a hard reload that resets in-memory nanostore state,
 * which doesn't represent a real user navigation. Unit-level check:
 * <AudioPlayerRoot /> is mounted at `apps/frontend-next/src/app/layout.tsx`
 * above the route outlet, so Next.js soft-nav preserves the <audio>
 * element. A future test can exercise this via an in-app next-chapter
 * button once we expose a stable selector for it.
 *
 * Prerequisites for the test to run (otherwise skipped):
 *   - Backend on :4000 with `TTS_PROVIDER=stub` (synchronous fixture response)
 *   - Frontend on :3000
 *   - A seeded reader account passed via `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD`
 */
import { expect, test } from "@playwright/test";

const HAS_CREDS = Boolean(
  process.env.E2E_TEST_EMAIL && process.env.E2E_TEST_PASSWORD,
);

/**
 * All three tabs (Summary / By Line / Detailed) mount their own chip,
 * but only the active tab's is visible — filter to visible + take first.
 */
function inlineEntryLocator(page: import("@playwright/test").Page) {
  return page
    .getByTestId("audio-inline-entry")
    .filter({ visible: true })
    .first();
}

function dockBarLocator(page: import("@playwright/test").Page) {
  return page.locator('[data-testid="audio-dock-bar"]');
}

test.describe("Explanation audio — first-play + full sheet", () => {
  test.skip(
    !HAS_CREDS,
    "E2E_TEST_EMAIL and E2E_TEST_PASSWORD env vars required",
  );

  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    // SignIn uses non-associated labels — target inputs by type.
    await page
      .locator('input[type="email"]')
      .fill(process.env.E2E_TEST_EMAIL as string);
    await page
      .locator('input[type="password"]')
      .fill(process.env.E2E_TEST_PASSWORD as string);
    await page.getByRole("button", { name: /^login$/i }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
      timeout: 15_000,
    });
  });

  test("first-play: 202→200 flow loads audio and mounts the dock", async ({
    page,
  }) => {
    await page.goto("/bible/genesis/1?explanationType=summary");

    // Wait for the chip to settle into the "populated" (or "playing")
    // state — i.e. audio is ready. Stub mode returns the fixture
    // synchronously, so this should happen in a few seconds.
    const entry = inlineEntryLocator(page);
    await expect(entry).toBeVisible({ timeout: 30_000 });
    await expect(entry).toHaveAttribute("data-state", /populated|playing/, {
      timeout: 30_000,
    });

    // Tap Play → dock appears, audio element gets a src.
    await entry.click();

    const dock = dockBarLocator(page);
    await expect(dock).toBeVisible({ timeout: 15_000 });

    const audioSrc = await page
      .locator("audio")
      .first()
      .evaluate((el: HTMLAudioElement) => el.src);
    expect(audioSrc.length).toBeGreaterThan(0);
    // The presigned MinIO URL contains the stub fixture path.
    expect(audioSrc).toMatch(/explanation-audio\/\d+/);
  });

  test("full sheet opens from dock, Esc closes it (TASK-016 a11y)", async ({
    page,
  }) => {
    await page.goto("/bible/genesis/1?explanationType=summary");

    const entry = inlineEntryLocator(page);
    await expect(entry).toBeVisible({ timeout: 30_000 });
    await expect(entry).toHaveAttribute("data-state", /populated|playing/, {
      timeout: 30_000,
    });
    await entry.click();

    const dock = dockBarLocator(page);
    await expect(dock).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: /open full player/i }).click();

    const fullSheet = page.getByRole("dialog", { name: /full audio player/i });
    await expect(fullSheet).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(fullSheet).toBeHidden();
  });
});
