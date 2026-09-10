import { test, expect } from '@playwright/test'
import { gotoApp, mix } from './helpers.js'

async function openPlayers(page) {
  await page.getByRole('button', { name: /players/i }).click()
  await expect(page.locator('.sheet__title')).toHaveText('Players')
}

async function addPlayer(page, name) {
  await page.locator('#player-add-input').fill(name)
  await page.getByRole('button', { name: 'Add' }).click()
}

test.describe('PlayersSheet', () => {
  test('empty roster shows a hint and disables Add until a name is typed', async ({ page }) => {
    await gotoApp(page)
    await openPlayers(page)
    await expect(page.locator('.playersSheet__empty')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add' })).toBeDisabled()
  })

  test('add, reorder, rename, remove and clear a roster', async ({ page }) => {
    await gotoApp(page)
    await openPlayers(page)

    await addPlayer(page, 'Alice')
    await addPlayer(page, 'Bob')
    await addPlayer(page, 'Charlie')
    await expect(page.locator('.playersSheet__name')).toHaveText(['Alice', 'Bob', 'Charlie'])

    // Move Charlie up one slot -> Alice, Charlie, Bob.
    await page.getByRole('button', { name: 'Move Charlie up' }).click()
    await expect(page.locator('.playersSheet__name')).toHaveText(['Alice', 'Charlie', 'Bob'])

    // Rename Bob -> Bobby (blur commits, per PlayersSheet.jsx).
    await page.getByRole('button', { name: 'Rename Bob' }).click()
    await page.locator('.playersSheet__renameInput').fill('Bobby')
    await page.locator('.playersSheet__renameInput').blur()
    await expect(page.locator('.playersSheet__name')).toHaveText(['Alice', 'Charlie', 'Bobby'])

    // Tapping a row's name makes them dealer.
    await page.getByRole('button', { name: 'Charlie', exact: true }).click()
    await expect(page.locator('.playersSheet__nameBtn--dealer .playersSheet__name')).toHaveText(
      'Charlie',
    )

    await page.getByRole('button', { name: 'Remove Alice' }).click()
    await expect(page.locator('.playersSheet__name')).toHaveText(['Charlie', 'Bobby'])

    await page.getByRole('button', { name: 'Clear all players' }).click()
    await expect(page.locator('.playersSheet__empty')).toBeVisible()
  })

  test('the header players button relabels once a roster exists', async ({ page }) => {
    await gotoApp(page)
    await expect(page.getByRole('button', { name: 'Add players' })).toBeVisible()

    await openPlayers(page)
    await addPlayer(page, 'Zara')
    await page.getByRole('button', { name: 'Close players' }).click()

    await expect(page.getByRole('button', { name: 'Manage players' })).toBeVisible()
  })

  test('the dealer rotates into Result, and its dealer line reopens the roster', async ({
    page,
  }) => {
    await gotoApp(page)
    await openPlayers(page)
    await addPlayer(page, 'Alice')
    await addPlayer(page, 'Bob')
    await page.getByRole('button', { name: 'Close players' }).click()

    // usePlayers.js seeds dealerIndex at 0 (Alice) on the first add, and
    // App.jsx's startMix() advances the dealer BEFORE picking - so the
    // very first mix after setup already rotates onto Bob, not Alice.
    await mix(page)
    await expect(page.locator('.result__dealer')).toHaveText('Bob deals')

    await page.locator('.result__dealer').click()
    await expect(page.locator('.sheet__title')).toHaveText('Players')
  })
})
