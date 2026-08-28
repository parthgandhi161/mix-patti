#!/usr/bin/env node
// This script talks to `npm run dev` ONLY. vite-plugin-pwa disables
// itself in dev (no `devOptions.enabled` in vite.config.js), so there is
// no service worker registered here at all - nothing to go stale. Do NOT
// repurpose this against the built/previewed app without carrying over
// the explicit SW-unregister/cache-clear step used in
// scripts/offline-check.mjs, which is the one place that needs it.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium, devices } from 'playwright'

export const DEV_URL = 'http://localhost:5173/mix-patti/'
const OUTPUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'output')

export async function launchDevice(deviceName) {
  const browser = await chromium.launch()
  const context = await browser.newContext({ ...devices[deviceName] })
  const page = await context.newPage()
  return { browser, context, page }
}

export const launchIPhone13 = () => launchDevice('iPhone 13')
export const launchIPhoneSE = () => launchDevice('iPhone SE')

// App.jsx's stage AnimatePresence deliberately has no `mode="wait"` (see
// CLAUDE.md): the outgoing stage's 220ms exit fade overlaps the incoming
// stage's entrance, so right after a transition BOTH `.stage` elements
// are still in the DOM. Wait for Framer Motion to actually unmount the
// exiting one rather than guessing at a duration - a fixed
// `waitForTimeout` here would be exactly the kind of drift-prone probe
// that looks fine locally and flakes under load.
async function waitForCrossfadeSettled(page) {
  await page.waitForFunction(() => document.querySelectorAll('.stage').length === 1)
}

// `{ force: true }` on every click: the idle `breathe` / `cardBreathe`
// loops mean Playwright's actionability check never considers
// `.stage__card` "stable".
export async function driveToStage(page, stage, { baseURL = DEV_URL } = {}) {
  await page.goto(baseURL)
  await page.waitForSelector('.stage.home')
  if (stage === 'home') return

  await page.click('button[aria-label="Mix a twist"]', { force: true })
  await page.waitForSelector('.stage.mixing')
  await waitForCrossfadeSettled(page)
  if (stage === 'mixing') return

  if (stage === 'result') {
    // The whole mixing container is the skip target (role="button",
    // aria-label="Mixing. Tap to skip") - clicking it anywhere finishes
    // the mix immediately, no need to wait out the ~4.26s natural timeline.
    await page.click('.stage.mixing', { force: true })
    await page.waitForSelector('.stage.result')
    await waitForCrossfadeSettled(page)
    return
  }

  throw new Error(`Unknown stage "${stage}" - expected "home", "mixing", or "result"`)
}

// `.stage__card` is the fixed four-band grid slot shared by all three
// stages - its own boundingBox is what proves the bands still line up.
//
// App.jsx's stage AnimatePresence deliberately has no `mode="wait"` (see
// CLAUDE.md), so during a crossfade BOTH the outgoing and incoming
// `.stage` are mounted at once, each with their own `.stage__card` - a
// bare `.stage__card` locator is ambiguous whenever a transition is
// still fading out. Scoping to `.stage.<name>` (the currently *entering*
// stage, which is what CLAUDE.md's "the bands still line up" check cares
// about) disambiguates that.
export async function measureCard(page, stage) {
  return page.locator(`.stage.${stage} .stage__card`).boundingBox()
}

export async function measureAllStages(page, { baseURL = DEV_URL } = {}) {
  await page.goto(baseURL)
  await page.waitForSelector('.stage.home')
  const home = await measureCard(page, 'home')

  await page.click('button[aria-label="Mix a twist"]', { force: true })
  await page.waitForSelector('.stage.mixing')
  await waitForCrossfadeSettled(page)
  const mixing = await measureCard(page, 'mixing')

  await page.click('.stage.mixing', { force: true })
  await page.waitForSelector('.stage.result')
  await waitForCrossfadeSettled(page)
  const result = await measureCard(page, 'result')

  return { home, mixing, result }
}

export async function screenshot(page, name) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  const filePath = path.join(OUTPUT_DIR, `${name}.png`)
  await page.screenshot({ path: filePath })
  return filePath
}

async function main() {
  const results = {}
  for (const label of ['iPhone 13', 'iPhone SE']) {
    const { browser, page } = await launchDevice(label)
    const slug = label.toLowerCase().replace(/\s+/g, '-')
    try {
      results[label] = await measureAllStages(page)
      await driveToStage(page, 'home')
      await screenshot(page, `${slug}-home`)
      await driveToStage(page, 'mixing')
      await screenshot(page, `${slug}-mixing`)
      await driveToStage(page, 'result')
      await screenshot(page, `${slug}-result`)
    } finally {
      await browser.close()
    }
  }
  fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  fs.writeFileSync(path.join(OUTPUT_DIR, 'measurements.json'), JSON.stringify(results, null, 2))
  console.log(JSON.stringify(results, null, 2))
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
