import { test, expect } from '@playwright/test'
import { gotoApp } from './helpers.js'

/**
 * src/lib/sound.js's AudioContext lifecycle can't be verified by simply
 * listening for sound (headless Chromium has no real output, and no iOS
 * backgrounding semantics) - CLAUDE.md documents the workaround this test
 * implements: wrap window.AudioContext to count constructions/close()s,
 * then fake a background/foreground cycle via document.visibilityState +
 * a dispatched 'visibilitychange', and assert live contexts never exceed
 * 1 and that a mix afterward still creates one (i.e. audio recovers
 * rather than staying permanently broken).
 */
test('never more than one live AudioContext, and audio recovers after a background cycle', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const log = { constructed: 0, closed: 0, live: 0, maxLive: 0 }
    window.__audioLog = log
    const RealCtx = window.AudioContext || window.webkitAudioContext
    class ProxyCtx extends RealCtx {
      constructor(...args) {
        super(...args)
        log.constructed++
        log.live++
        log.maxLive = Math.max(log.maxLive, log.live)
      }
      close(...args) {
        if (log.live > 0) log.live--
        log.closed++
        return super.close(...args)
      }
    }
    window.AudioContext = ProxyCtx
    if ('webkitAudioContext' in window) window.webkitAudioContext = ProxyCtx
  })

  await gotoApp(page)

  // primeAudio() runs synchronously inside the "Mix a twist" click
  // handler (see App.jsx's startMix) - a real user gesture, so it should
  // reliably construct one context.
  await page.locator('button.home__cardBtn').click()
  await expect(page.getByRole('button', { name: 'Show rules' })).toBeVisible({ timeout: 4000 })

  await expect.poll(() => page.evaluate(() => window.__audioLog.constructed)).toBeGreaterThan(0)
  const afterFirstMix = await page.evaluate(() => ({ ...window.__audioLog }))
  expect(afterFirstMix.live).toBeLessThanOrEqual(1)

  // Fake backgrounding - sound.js's onVisibility tears the context down
  // outright on 'hidden' rather than trying to keep it alive.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect.poll(() => page.evaluate(() => window.__audioLog.live)).toBe(0)

  // Fake foregrounding - schedules an off-gesture repair.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })

  await page.getByRole('button', { name: 'Mix again' }).click()
  await expect(page.locator('.result__card .card__name')).toBeVisible()

  const final = await page.evaluate(() => ({ ...window.__audioLog }))
  expect(final.maxLive).toBeLessThanOrEqual(1)
  expect(final.constructed).toBeGreaterThan(afterFirstMix.constructed)
})
