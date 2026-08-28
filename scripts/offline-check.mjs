#!/usr/bin/env node
// Offline-mode check: the ONE flow in this harness that talks to the real
// production build. `npm run dev` never registers a service worker at all
// (vite-plugin-pwa disables itself in dev), so this is the only place a
// real installed SW and real Cache Storage exist - and therefore the only
// place a *stale* one is a risk. Every fresh context here explicitly
// unregisters any service worker and clears Cache Storage before relying
// on a freshly-installed one. Do not remove that step, and do not point
// scripts/shot.mjs's routine measurement flows at this build+preview path
// without carrying the same defense over.
import { execSync, spawn } from 'node:child_process'
import { launchIPhone13 } from './shot.mjs'

const PREVIEW_PORT = 4173
const PREVIEW_URL = `http://localhost:${PREVIEW_PORT}/mix-patti/`

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`)
}

async function waitForServer(url, { timeoutMs = 20000 } = {}) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  throw new Error(`${url} did not respond within ${timeoutMs}ms`)
}

async function clearServiceWorkerState(page) {
  await page.evaluate(async () => {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrations.map((r) => r.unregister()))
    }
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    }
  })
}

async function main() {
  console.log('Building production bundle (npm run build)...')
  execSync('npm run build', { stdio: 'inherit' })

  console.log(`Starting npm run preview on port ${PREVIEW_PORT}...`)
  const preview = spawn(
    'npm',
    ['run', 'preview', '--', '--port', String(PREVIEW_PORT), '--strictPort'],
    { stdio: 'pipe' },
  )

  try {
    await waitForServer(PREVIEW_URL)

    const { browser, page } = await launchIPhone13()
    try {
      // First load: reset any leftover SW/cache state before trusting a
      // fresh install.
      await page.goto(PREVIEW_URL)
      await clearServiceWorkerState(page)

      // Second load: this is the one that actually installs the SW
      // against the build we just produced.
      await page.reload()
      await page.evaluate(() => navigator.serviceWorker.ready)

      await page.context().setOffline(true)
      await page.reload()

      // Drive the full mix flow entirely offline.
      assert(await page.locator('.stage.home').isVisible(), 'home stage should render offline')

      await page.click('button[aria-label="Mix a twist"]', { force: true })
      await page.waitForSelector('.stage.mixing')

      await page.click('.stage.mixing', { force: true })
      await page.waitForSelector('.stage.result')

      const resultVisible = await page.locator('.stage.result').isVisible()
      const resultText = await page.locator('.stage.result .stage__card').innerText()
      assert(resultVisible, '.stage.result should render offline')
      assert(resultText.trim().length > 0, '.stage.result should have content offline, not a blank card')

      console.log('PASS: full mix flow completes offline against the installed service worker.')
    } finally {
      await browser.close()
    }
  } finally {
    preview.kill()
  }
}

main().catch((err) => {
  console.error('FAIL:', err.message)
  process.exit(1)
})
