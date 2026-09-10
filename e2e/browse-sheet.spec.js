import { test, expect } from '@playwright/test'
import variations from '../src/data/variations.json' with { type: 'json' }
import { gotoApp } from './helpers.js'

const target = variations[0]

test.describe('BrowseSheet', () => {
  test('search filters the list by name, and a row opens RulesSheet on top', async ({ page }) => {
    await gotoApp(page)
    await page.getByRole('button', { name: 'All twists' }).click()
    await expect(page.locator('.sheet__title')).toHaveText('All twists')

    // Unfiltered: every variation is listed.
    await expect(page.locator('.browseSheet__item')).toHaveCount(variations.length)

    await page.locator('#browse-search').fill(target.name)
    await expect(page.locator('.browseSheet__item')).toHaveCount(1)
    await expect(page.locator('.browseSheet__name')).toHaveText(target.name)

    await page.getByRole('button', { name: target.name, exact: true }).click()
    // RulesSheet layers on top - its own title is the same variation.
    // Both sheets are mounted at once (BrowseSheet stays under it,
    // `inert` but not unmounted), in DOM order.
    await expect(page.locator('.sheet__title')).toHaveText(['All twists', target.name])

    // Closing that RulesSheet lands back on the Browse list, not the
    // underlying Home/Result stage (App.jsx's browseTarget mechanism).
    await page.getByRole('button', { name: 'Close rules' }).click()
    await expect(page.locator('.sheet__title')).toHaveText('All twists')
    await expect(page.locator('.browseSheet__item')).toHaveCount(1)
  })

  test('an unmatched search shows the empty state', async ({ page }) => {
    await gotoApp(page)
    await page.getByRole('button', { name: 'All twists' }).click()
    await page.locator('#browse-search').fill('zzzznonexistenttwistzzzz')
    await expect(page.locator('.browseSheet__empty')).toHaveText(
      'No twists match "zzzznonexistenttwistzzzz".',
    )
    await expect(page.locator('.browseSheet__item')).toHaveCount(0)
  })

  test('starring a row surfaces it under the Starred filter', async ({ page }) => {
    await gotoApp(page)
    await page.getByRole('button', { name: 'All twists' }).click()
    await page.locator('#browse-search').fill(target.name)

    await page.getByRole('button', { name: `Star ${target.name}` }).click()
    await expect(page.getByRole('button', { name: `Unstar ${target.name}` })).toBeVisible()

    await page.locator('#browse-search').fill('')
    await page.getByRole('button', { name: '★ Starred' }).click()
    await expect(page.locator('.browseSheet__item')).toHaveCount(1)
    await expect(page.locator('.browseSheet__name')).toHaveText(target.name)
  })

  test('closing the sheet returns to the underlying stage', async ({ page }) => {
    await gotoApp(page)
    await page.getByRole('button', { name: 'All twists' }).click()
    await page.getByRole('button', { name: 'Close all twists' }).click()
    await expect(page.locator('.sheet__title')).toBeHidden()
    await expect(page.locator('button.home__cardBtn')).toBeVisible()
  })
})
