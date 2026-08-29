import { registerSW } from 'virtual:pwa-register'

// Foreground safety net for a long-lived session; the real trigger is the
// visibilitychange check below, which covers an iOS PWA resuming from the
// background - that never fires window 'load' again, so it's the only way
// the browser gets an early chance to finish installing an update before
// the *next* close+reopen.
const CHECK_INTERVAL_MS = 60 * 60 * 1000
// Upper bound on how long Boot.jsx will wait before giving up and letting
// the app open anyway. Covers two very different waits with one number: a
// slow/offline first check (resolves in well under a second in practice),
// and - if that check finds a new build - a bounded wait for the install
// it kicks off to finish and activate. That second case is what actually
// needs a budget this size: registration.update() resolving only means an
// install *started*, not that it finished (a full precache re-download
// "doesn't always finish inside one short session" - see CLAUDE.md), so if
// Boot let go the instant the check was attempted, an update found right
// at launch would install and reload *after* Home was already showing the
// old build - a stale-Home flash followed by a second splash, the exact
// double-flash this budget exists to prevent. The longer wait only ever
// happens in that one rare case (a fresh deploy's first cold launch).
const BOOT_MAX_WAIT_MS = 6000

let reloadSafe = true

// Set from App.jsx whenever stage/overlay changes. True only at the idle
// Home stage with no sheet open - the one point a silent reload can't
// lose anything (no mix in progress, no sheet content to drop). It's also
// true for the entire boot phase by construction (stage/overlay start at
// those same safe defaults), which is what lets onNeedReload below fire
// immediately while Boot is still the only thing on screen.
export function setReloadSafe(safe) {
  reloadSafe = safe
}

// Resolved once we know the outcome of the very first update check:
// either there's nothing new, or the browser gave up registering a
// service worker at all - Boot.jsx awaits this (bounded by
// BOOT_MAX_WAIT_MS above, so a slow/offline network never traps the
// splash). If the check instead finds a new build, this deliberately does
// NOT resolve right away - see markUpdateInstalling below - so Boot keeps
// covering the screen until either that install activates (onNeedReload
// fires and reloads immediately, seamless because nothing else has been
// shown yet) or the same budget gives up and reveals the current build.
let markBootCheckDone
const bootCheck = new Promise((resolve) => {
  markBootCheckDone = resolve
})

export function checkOnBoot() {
  return Promise.race([
    bootCheck,
    new Promise((resolve) => setTimeout(resolve, BOOT_MAX_WAIT_MS)),
  ])
}

// Boot.jsx's only hook into "is an update actually installing right now" -
// lets it swap its status line to say so instead of sitting on stale copy
// for however long the install takes. Only ever meant to be called once,
// by Boot's own effect on mount.
let updateInstalling = false
let onUpdateInstalling = null
function markUpdateInstalling() {
  updateInstalling = true
  onUpdateInstalling?.()
}
export function onBootUpdateFound(cb) {
  if (updateInstalling) cb()
  else onUpdateInstalling = cb
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
      checkForUpdate(swUrl, registration).finally(() => {
        // registration.update() having resolved doesn't mean nothing
        // changed - if it found a new build, `installing` is already set
        // by now (the browser starts the install as part of that same
        // update algorithm). In that case, stay on the splash instead of
        // releasing it: onNeedReload below fires once that install
        // activates, and reloading only reads as seamless if Boot is
        // still covering the screen when it does.
        if (registration.installing) {
          markUpdateInstalling()
        } else {
          markBootCheckDone()
        }
      })
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
