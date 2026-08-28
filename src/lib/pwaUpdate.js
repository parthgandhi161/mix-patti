import { registerSW } from 'virtual:pwa-register'

// Foreground safety net for a long-lived session; the real trigger is the
// visibilitychange check below, which covers an iOS PWA resuming from the
// background - that never fires window 'load' again, so it's the only way
// the browser gets an early chance to finish installing an update before
// the *next* close+reopen.
const CHECK_INTERVAL_MS = 60 * 60 * 1000

let reloadSafe = true

// Set from App.jsx whenever stage/overlay changes. True only at the idle
// Home stage with no sheet open - the one point a silent reload can't
// lose anything (no mix in progress, no sheet content to drop).
export function setReloadSafe(safe) {
  reloadSafe = safe
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
      if (!registration) return
      setInterval(() => checkForUpdate(swUrl, registration), CHECK_INTERVAL_MS)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkForUpdate(swUrl, registration)
      })
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
