import { defineConfig, devices } from '@playwright/test'

// This is a real assertion-based test suite (e2e/*.spec.js), separate from
// scripts/shot.mjs + scripts/offline-check.mjs (README's "Visual checks with
// Playwright") - those are a committed screenshot/measurement harness with
// no pass/fail assertions; this is `npm run test:e2e`, one command that
// exercises the actual app in a real browser and fails the way `npm test`
// does. See CLAUDE.md's testing policy for when to add to this.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  timeout: 15_000,
  use: {
    baseURL: 'http://localhost:5173/mix-patti/',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // iPhone 13, not a generic viewport: hasTouch/pointer:coarse is what
    // this app's mobile-only behavior (isTouchPrimary() in
    // src/lib/immersive.js - FullscreenToggle, the wake-lock auto-enter)
    // keys off, not just screen size. See CLAUDE.md's Playwright note.
    // devices['iPhone 13'] defaults to WebKit (defaultBrowserType) -
    // forced back to chromium (the only browser this repo installs, and
    // what scripts/shot.mjs already standardizes on) via browserName.
    ...devices['iPhone 13'],
    browserName: 'chromium',
  },
  projects: [{ name: 'chromium', use: {} }],
  webServer: {
    command: 'npm run dev -- --strictPort',
    url: 'http://localhost:5173/mix-patti/',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
})
