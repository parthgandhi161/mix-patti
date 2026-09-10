import { test, expect } from '@playwright/test'
import variations from '../src/data/variations.json' with { type: 'json' }
import { MIN_UNMUTED } from '../src/lib/pick.js'
import { gotoApp, mix } from './helpers.js'

const STARRED_KEY = 'mixpatti.starredVariations'
const MUTED_KEY = 'mixpatti.mutedVariations'

function idFor(name) {
  return variations.find((v) => v.name === name).id
}

test.describe('star & mute preferences', () => {
  test('starring on Result persists to localStorage and reflects in BrowseSheet', async ({
    page,
  }) => {
    await gotoApp(page)
    await mix(page)
    const name = await page.locator('.result__card .card__name').innerText()

    await page.getByRole('button', { name: 'Star this twist' }).click()
    await expect(page.getByRole('button', { name: 'Unstar this twist' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    const stored = await page.evaluate((k) => localStorage.getItem(k), STARRED_KEY)
    expect(JSON.parse(stored)).toContain(idFor(name))

    await page.getByRole('button', { name: 'All twists' }).click()
    await page.getByRole('button', { name: '★ Starred' }).click()
    await expect(page.locator('.browseSheet__item')).toHaveCount(1)
    await expect(page.locator('.browseSheet__name')).toHaveText(name)

    // Unstar round-trips back out of localStorage too.
    await page.getByRole('button', { name: `Unstar ${name}` }).click()
    const clearedStored = await page.evaluate((k) => localStorage.getItem(k), STARRED_KEY)
    expect(JSON.parse(clearedStored)).not.toContain(idFor(name))
  })

  test('muting on Result persists and excludes the twist from later draws', async ({ page }) => {
    await gotoApp(page)
    await mix(page)
    const name = await page.locator('.result__card .card__name').innerText()

    await page.getByRole('button', { name: 'Mute this twist' }).click()
    await expect(page.getByRole('button', { name: 'Unmute this twist' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    const stored = await page.evaluate((k) => localStorage.getItem(k), MUTED_KEY)
    expect(JSON.parse(stored)).toContain(idFor(name))

    let shown = name
    for (let i = 0; i < 10; i++) {
      await page.getByRole('button', { name: 'Mix again' }).click()
      // Waits for the text to actually CHANGE from what was on screen
      // before this click - Result briefly stays showing the outgoing
      // variation while 'mixing' plays, so a bare toBeVisible() here
      // would pass instantly against stale (pre-click) content instead
      // of waiting for the new draw.
      await expect(page.locator('.result__card .card__name')).not.toHaveText(shown, {
        timeout: 4000,
      })
      shown = await page.locator('.result__card .card__name').innerText()
      expect(shown).not.toBe(name)
    }
  })

  test('the MIN_UNMUTED floor disables muting the last two unmuted twists', async ({ page }) => {
    // Seed localStorage BEFORE the app boots, muting all but the last two
    // ids - pick.js's MIN_UNMUTED (2) then guarantees any real draw lands
    // on one of those two remaining, and canToggleMute (useVariationPrefs.js)
    // must refuse to let this one be muted too.
    const keepUnmuted = variations.slice(-2).map((v) => v.id)
    const mutedIds = variations.filter((v) => !keepUnmuted.includes(v.id)).map((v) => v.id)
    await page.addInitScript(
      ([key, ids]) => localStorage.setItem(key, JSON.stringify(ids)),
      [MUTED_KEY, mutedIds],
    )

    await gotoApp(page)
    await mix(page)
    const name = await page.locator('.result__card .card__name').innerText()
    expect(keepUnmuted).toContain(idFor(name))

    const muteBtn = page.getByRole('button', { name: 'Mute this twist' })
    await expect(muteBtn).toBeDisabled()
    await expect(muteBtn).toHaveAttribute('title', `Keep at least ${MIN_UNMUTED} twists in the draw`)
  })
})
