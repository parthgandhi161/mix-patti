import { test, expect, devices } from '@playwright/test'
import { gotoApp } from './helpers.js'

test.describe('Header', () => {
  test('mute toggle flips aria-pressed/label and survives a reload', async ({ page }) => {
    await gotoApp(page)
    const muteBtn = page.getByRole('button', { name: 'Mute sound' })
    await expect(muteBtn).toHaveAttribute('aria-pressed', 'false')

    await muteBtn.click()
    await expect(page.getByRole('button', { name: 'Unmute sound' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await page.reload()
    await expect(page.locator('button.home__cardBtn')).toBeVisible({ timeout: 6000 })
    await expect(page.getByRole('button', { name: 'Unmute sound' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  test('house rules opens the four global rules and closes back', async ({ page }) => {
    await gotoApp(page)
    await page.getByRole('button', { name: 'House rules' }).click()
    await expect(page.locator('.sheet__title')).toHaveText('House rules')
    await expect(page.getByText('Natural beats joker.', { exact: false })).toBeVisible()

    await page.getByRole('button', { name: 'Close house rules' }).click()
    await expect(page.locator('.sheet__title')).toBeHidden()
  })

  test('the wordmark is visually hidden on Home but shown elsewhere', async ({ page }) => {
    await gotoApp(page)
    await expect(page.locator('.appHeader__word')).toHaveClass(/appHeader__word--hidden/)

    await page.locator('button.home__cardBtn').click()
    await expect(page.getByRole('button', { name: 'Show rules' })).toBeVisible({ timeout: 4000 })
    await expect(page.locator('.appHeader__word')).not.toHaveClass(/appHeader__word--hidden/)
  })
})

test.describe('FullscreenToggle (platform gating)', () => {
  test('shown on a touch-primary device', async ({ page }) => {
    await gotoApp(page)
    await expect(page.getByRole('button', { name: 'Enter fullscreen' })).toBeVisible()
  })

  test('hidden on a non-touch desktop viewport', async ({ browser }) => {
    // Own context, deliberately NOT the iPhone 13 device this config
    // defaults to - see immersive.js's isTouchPrimary(): pointer:coarse
    // gates this button, not viewport width, so the desktop layout
    // (a phone-shaped card on a backdrop, per CLAUDE.md) never offers it.
    const context = await browser.newContext({ ...devices['Desktop Chrome'] })
    const page = await context.newPage()
    await gotoApp(page)
    await expect(page.getByRole('button', { name: 'Enter fullscreen' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Fullscreen info' })).toHaveCount(0)
    await context.close()
  })
})
