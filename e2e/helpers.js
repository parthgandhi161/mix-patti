import { expect } from '@playwright/test'

/**
 * Every spec starts here instead of a bare page.goto(): it also asks for
 * prefers-reduced-motion, which src/components/Mixing.jsx and Result.jsx
 * both already honor by skipping straight to the landed/settled state
 * (see CLAUDE.md's "Respect prefers-reduced-motion"). That's not a test
 * shortcut bypassing real code - it's a real, documented code path that
 * otherwise has zero automated coverage - and it turns the ~4s shuffle
 * animation into function of TIMELINE.hold (360ms), which is what keeps
 * this whole suite fast enough to run before every commit.
 *
 * Boot.jsx covers the screen for at least MIN_VISIBLE_MS (900ms), and in
 * `npm run dev` vite-plugin-pwa's registerSW is a total no-op, so Boot
 * actually clears via pwaUpdate.js's BOOT_CHECK_TIMEOUT_MS (2500ms)
 * fallback, not a real update check - hence the generous timeout below
 * rather than the default 5s action timeout.
 */
export async function gotoApp(page) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(page.locator('button.home__cardBtn')).toBeVisible({ timeout: 6000 })
}

/** Taps the Home card and waits for Result to land. */
export async function mix(page) {
  await page.locator('button.home__cardBtn').click()
  await expect(page.getByRole('button', { name: 'Show rules' })).toBeVisible({ timeout: 4000 })
}

/** Result's "Mix again" - same wait as mix(), for use once already on Result. */
export async function mixAgain(page) {
  const name = await page.locator('.result__card .card__name').innerText()
  await page.getByRole('button', { name: 'Mix again' }).click()
  await expect(page.locator('.result__card .card__name')).not.toHaveText(name, { timeout: 4000 })
}
