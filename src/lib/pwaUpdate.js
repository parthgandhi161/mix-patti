import { registerSW } from 'virtual:pwa-register'

// Foreground safety net for a long-lived session; the real trigger is the
// visibilitychange check below, which covers an iOS PWA resuming from the
// background - that never fires window 'load' again, so it's the only way
// the browser gets an early chance to finish installing an update before
// the *next* close+reopen.
const CHECK_INTERVAL_MS = 60 * 60 * 1000
// How long Boot.jsx will wait for the very first update check before
// giving up and letting the app open anyway - a slow or offline network
// must never trap the splash screen.
const BOOT_CHECK_TIMEOUT_MS = 2500

let reloadSafe = true

// Set from App.jsx whenever stage/overlay changes. True only at the idle
// Home stage with no sheet open - the one point a silent reload can't
// lose anything (no mix in progress, no sheet content to drop).
export function setReloadSafe(safe) {
  reloadSafe = safe
}

// Resolved once the very first update check has been attempted, or the
// browser gave up registering a service worker at all - Boot.jsx awaits
// this. Resolving does NOT mean "no update exists": registration.update()
// finding a byte diff only starts an async install that can outlive the
// splash (a full precache re-download "doesn't always finish inside one
// short session" - see this file's module comment context in CLAUDE.md).
// If that install finishes later, onNeedReload below fires exactly as it
// always has, whether Boot or Home is on screen by then - so nothing
// here tries to represent an "update found, installing" state, since it
// can't be reliably observed from this promise.
let markBootCheckDone
const bootCheck = new Promise((resolve) => {
  markBootCheckDone = resolve
})

export function checkOnBoot() {
  return Promise.race([
    bootCheck,
    new Promise((resolve) => setTimeout(resolve, BOOT_CHECK_TIMEOUT_MS)),
  ])
}

async function checkForUpdate(swUrl, registration) {
  if (!registration || registration.installing) return
  if ('connection' in navigator && !navigator.onLine) return
  try {
    const resp = await fetch(swUrl, {
      cache: 'no-store',
      headers: { cache: 'no-store', 'cache-control': 'no-cache' },
    })
    if (resp?.status === 200) await registration.update()
  } catch {
    // Offline or the request failed - the next scheduled check retries.
  }
}

function install() {
  registerSW({
    onRegisteredSW(swUrl, registration) {
      if (!registration) {
        markBootCheckDone()
        return
      }
      setInterval(() => checkForUpdate(swUrl, registration), CHECK_INTERVAL_MS)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkForUpdate(swUrl, registration)
      })
      checkForUpdate(swUrl, registration).finally(markBootCheckDone)
    },
    onRegisterError() {
      markBootCheckDone()
    },
    onNeedReload() {
      // registerType: 'autoUpdate' would otherwise call
      // window.location.reload() unconditionally the instant the new
      // worker activates - including mid-mix. Only take it here, at the
      // one safe boundary; anywhere else, stay put and let the
      // now-active worker serve the update on the next real reopen.
      if (reloadSafe) window.location.reload()
    },
  })
}

install()
