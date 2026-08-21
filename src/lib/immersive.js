import { useCallback, useEffect, useRef } from 'react'

/**
 * Touch-primary input = phone/tablet. Deliberately NOT width-based: a
 * resized desktop browser window is still pointer:fine and must never
 * go fullscreen, or it would blow away the deliberate "phone-shaped
 * app floating on the plum backdrop" desktop layout.
 */
export function isTouchPrimary() {
  return (
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(pointer: coarse)').matches
  )
}

/**
 * Go fullscreen and keep the screen awake, like a video player -
 * mobile only, best-effort everywhere.
 *
 * iOS Safari has historically had absent/inconsistent support for
 * requestFullscreen() on arbitrary (non-<video>) elements, and Wake
 * Lock only shipped in Safari 16.4+. That's a platform limitation:
 * every call here is wrapped so an unsupported browser just silently
 * no-ops rather than breaking anything.
 */
export function useImmersive() {
  const wakeLockRef = useRef(null)
  const startedRef = useRef(false)

  const acquireLock = () => {
    try {
      navigator.wakeLock
        ?.request('screen')
        .then((lock) => {
          wakeLockRef.current = lock
        })
        .catch(() => {})
    } catch {
      /* no Wake Lock API */
    }
  }

  // enter() must run synchronously inside a click handler - both the
  // Fullscreen and Wake Lock APIs require an active user gesture.
  const enter = useCallback(() => {
    if (startedRef.current || !isTouchPrimary()) return
    startedRef.current = true
    try {
      document.documentElement.requestFullscreen?.().catch(() => {})
    } catch {
      /* no Fullscreen API, or blocked */
    }
    acquireLock()
  }, [])

  useEffect(() => {
    // Browsers release the wake lock when the tab is backgrounded;
    // grab it back the moment the app is visible again.
    const onVisibility = () => {
      if (startedRef.current && document.visibilityState === 'visible') {
        acquireLock()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      wakeLockRef.current?.release?.().catch(() => {})
    }
  }, [])

  return enter
}
