import { test, expect } from '@playwright/test'
import variations from '../src/data/variations.json' with { type: 'json' }
import { gotoApp, mixAgain } from './helpers.js'

const variationNames = new Set(variations.map((v) => v.name))

test.describe('home -> mixing -> result', () => {
  test('tapping the card lands on a real variation with rules and badges', async ({ page }) => {
    await gotoApp(page)

    await expect(page.getByText(`${variations.length} twists on Teen Patti`)).toBeVisible()

    await page.locator('button.home__cardBtn').click()

    const name = await page.locator('.result__card .card__name').innerText()
    expect(variationNames.has(name)).toBe(true)

    // Result's three footer actions and its badge row.
    await expect(page.getByRole('button', { name: 'Show rules' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Compare hands' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Mix again' })).toBeVisible()
    await expect(page.locator('.result__badge').first()).toBeVisible()
  })

  test('mix again never repeats the immediately previous variation', async ({ page }) => {
    await gotoApp(page)
    await page.locator('button.home__cardBtn').click()
    await expect(page.locator('.result__card .card__name')).toBeVisible()

    let previous = await page.locator('.result__card .card__name').innerText()
    for (let i = 0; i < 8; i++) {
      await mixAgain(page)
      const current = await page.locator('.result__card .card__name').innerText()
      expect(current).not.toBe(previous)
      expect(variationNames.has(current)).toBe(true)
      previous = current
    }
  })

  test('chrome dims mid-mix and the floating suits hide, without reduced motion', async ({
    page,
  }) => {
    // This one test wants the real animation, so it deliberately skips
    // gotoApp()'s emulateMedia - it's checking the chrome-dim behavior
    // during the shuffle phase itself (App.jsx's dimChrome), not the end
    // state. The header itself stays mounted throughout (showHeader is
    // `!overlay`, not stage-dependent) - only .suits unmounts and
    // .shell/.appHeader pick up the --dim modifier.
    await page.goto('/')
    await expect(page.locator('button.home__cardBtn')).toBeVisible({ timeout: 6000 })

    // Home's footer button, not the card itself: the idle card carries a
    // breathing loop (breathe/cardBreathe in global.css, see CLAUDE.md's
    // Playwright note) that keeps shifting its hit box mid-click, which
    // stray clicks land on a decorative descendant instead of the button.
    // The footer button does the same onMix and has no such animation.
    await page.getByRole('button', { name: 'Mix a twist' }).last().click()
    await expect(page.locator('.shell')).toHaveClass(/shell--dim/)
    await expect(page.locator('.appHeader')).toHaveClass(/appHeader--dim/)
    await expect(page.locator('.suits')).toBeHidden()

    await expect(page.getByRole('button', { name: 'Show rules' })).toBeVisible({ timeout: 6000 })
    await expect(page.locator('.shell')).not.toHaveClass(/shell--dim/)
  })
})
