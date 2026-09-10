import { test, expect } from '@playwright/test'
import { gotoApp, mix } from './helpers.js'

test.describe('RulesSheet', () => {
  test('dense mode shows setup/play/winner sections and closes back to Result', async ({
    page,
  }) => {
    await gotoApp(page)
    await mix(page)
    const name = await page.locator('.result__card .card__name').innerText()

    await page.getByRole('button', { name: 'Show rules' }).click()

    await expect(page.locator('.sheet__title')).toHaveText(name)
    await expect(page.getByText('Setup · once')).toBeVisible()
    await expect(page.getByText('Play · each round')).toBeVisible()
    await expect(page.getByText('How you win')).toBeVisible()

    await page.getByRole('button', { name: 'Close rules' }).click()
    await expect(page.locator('.sheet__title')).toBeHidden()
    await expect(page.getByRole('button', { name: 'Mix again' })).toBeVisible()
  })

  test('explain mode steps through one item at a time', async ({ page }) => {
    await gotoApp(page)
    await mix(page)
    await page.getByRole('button', { name: 'Show rules' }).click()

    await page.getByRole('button', { name: 'Switch to explain mode' }).click()
    await expect(page.locator('.rulesSheet__stepCount')).toHaveText(/^1 \//)

    const [, total] = (await page.locator('.rulesSheet__stepCount').innerText()).split(' / ')
    await expect(page.getByRole('button', { name: 'Previous step' })).toBeDisabled()

    await page.getByRole('button', { name: 'Next step' }).click()
    await expect(page.locator('.rulesSheet__stepCount')).toHaveText(`2 / ${total}`)
    await expect(page.getByRole('button', { name: 'Previous step' })).toBeEnabled()

    // Walk to the very last step and confirm Next disables there.
    for (let i = 2; i < Number(total); i++) {
      await page.getByRole('button', { name: 'Next step' }).click()
    }
    await expect(page.locator('.rulesSheet__stepCount')).toHaveText(`${total} / ${total}`)
    await expect(page.getByRole('button', { name: 'Next step' })).toBeDisabled()

    await page.getByRole('button', { name: 'Previous step' }).click()
    await expect(page.locator('.rulesSheet__stepCount')).toHaveText(`${Number(total) - 1} / ${total}`)
  })

  test('reading mode is remembered across a close+reopen, but the step always resets to 1', async ({
    page,
  }) => {
    await gotoApp(page)
    await mix(page)
    await page.getByRole('button', { name: 'Show rules' }).click()
    await page.getByRole('button', { name: 'Switch to explain mode' }).click()
    await page.getByRole('button', { name: 'Next step' }).click()
    await expect(page.locator('.rulesSheet__stepCount')).toHaveText(/^2 \//)

    await page.getByRole('button', { name: 'Close rules' }).click()
    await page.getByRole('button', { name: 'Show rules' }).click()

    // Mode persisted (still explain, so the toggle now offers to switch
    // back to full rules) - see useReadingMode.js / mixpatti.rulesMode.
    await expect(page.getByRole('button', { name: 'Switch to full rules' })).toBeVisible()
    // Step index did NOT persist - always starts back at step 1.
    await expect(page.locator('.rulesSheet__stepCount')).toHaveText(/^1 \//)
  })
})
