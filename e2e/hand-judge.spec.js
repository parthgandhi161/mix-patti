import { test, expect } from '@playwright/test'
import { gotoApp, mix } from './helpers.js'

/** Opens the next empty slot's drawer (rank -> suit -> normal/joker) and commits one card. */
async function fillNextSlot(page, rank, suit, { joker = false } = {}) {
  await expect(page.getByText('Pick a rank')).toBeVisible()
  await page.getByRole('button', { name: rank, exact: true }).click()
  await expect(page.getByText(/pick a suit/)).toBeVisible()
  await page.getByRole('button', { name: suit, exact: true }).click()
  await expect(page.getByText('One more thing')).toBeVisible()
  await page
    .locator('.handJudgeSheet__tagRow')
    .getByRole('button', { name: joker ? '★ Joker' : 'Normal' })
    .click()
}

test.describe('HandJudgeSheet', () => {
  test('a trail beats junk, and Reset clears both hands', async ({ page }) => {
    await gotoApp(page)
    await mix(page)
    await page.getByRole('button', { name: 'Compare hands' }).click()
    await expect(page.locator('.sheet__title')).toHaveText('Compare hands')

    await expect(page.getByRole('button', { name: 'Judge', exact: true })).toBeDisabled()

    await page
      .locator('.handJudgeSheet__handBlock', { hasText: 'Hand 1' })
      .getByRole('button', { name: 'Empty card, tap to fill' })
      .first()
      .click()

    // Hand 1: A-A-A (trail). Hand 2: 2-3-5 (junk). The drawer
    // auto-advances to the next empty slot after each commit
    // (nextEmptySlot in src/lib/judge/handJudge.js), so only the very
    // first slot needs an explicit open.
    await fillNextSlot(page, 'A', 'S')
    await fillNextSlot(page, 'A', 'H')
    await fillNextSlot(page, 'A', 'D')
    await fillNextSlot(page, '2', 'C')
    await fillNextSlot(page, '3', 'D')
    await fillNextSlot(page, '5', 'H')

    const judgeBtn = page.getByRole('button', { name: 'Judge', exact: true })
    await expect(judgeBtn).toBeEnabled()
    await judgeBtn.click()

    await expect(page.locator('.handJudgeSheet__winner')).toHaveText('Hand 1 wins')
    await expect(page.locator('.handJudgeSheet__crown')).toBeVisible()

    await page.getByRole('button', { name: 'Judge another' }).click()
    await expect(page.locator('.handJudgeSheet__winner')).toBeHidden()
    await expect(
      page
        .locator('.handJudgeSheet__handBlock', { hasText: 'Hand 1' })
        .getByRole('button', { name: 'Empty card, tap to fill' }),
    ).toHaveCount(3)
  })

  test('a duplicate card across hands shows a warning', async ({ page }) => {
    await gotoApp(page)
    await mix(page)
    await page.getByRole('button', { name: 'Compare hands' }).click()

    // The drawer's full-bleed dim (`.handJudgeSheet__dim`, z-index above
    // the hand rows) means an underlying slot can't be clicked while it's
    // open - so this fills hand 1 completely first (auto-advancing after
    // each commit, per nextEmptySlot), which lands the drawer on hand 2's
    // first slot on its own; re-entering hand 1's own first card (K♠)
    // there is the duplicate.
    await page
      .locator('.handJudgeSheet__handBlock', { hasText: 'Hand 1' })
      .getByRole('button', { name: 'Empty card, tap to fill' })
      .first()
      .click()
    await fillNextSlot(page, 'K', 'S')
    await fillNextSlot(page, 'Q', 'S')
    await fillNextSlot(page, 'J', 'S')
    await fillNextSlot(page, 'K', 'S')

    await expect(
      page.getByText('Same card entered twice - double-check before judging.'),
    ).toBeVisible()
  })

  test('tagging a card as joker is reflected on its slot', async ({ page }) => {
    await gotoApp(page)
    await mix(page)
    await page.getByRole('button', { name: 'Compare hands' }).click()

    await page
      .locator('.handJudgeSheet__handBlock', { hasText: 'Hand 1' })
      .getByRole('button', { name: 'Empty card, tap to fill' })
      .first()
      .click()
    await fillNextSlot(page, '7', 'C', { joker: true })

    await expect(
      page.getByRole('button', { name: '7 of C, tap to change' }),
    ).toBeVisible()
  })

  test('closing the sheet returns to Result', async ({ page }) => {
    await gotoApp(page)
    await mix(page)
    await page.getByRole('button', { name: 'Compare hands' }).click()
    await page.getByRole('button', { name: 'Close hand judge' }).click()
    await expect(page.locator('.sheet__title')).toBeHidden()
    await expect(page.getByRole('button', { name: 'Mix again' })).toBeVisible()
  })
})
