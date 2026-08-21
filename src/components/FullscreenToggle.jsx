import { useEffect, useState } from 'react'
import { isTouchPrimary } from '../lib/immersive'
import './FullscreenToggle.css'

const SUPPORTS_FULLSCREEN =
  typeof document !== 'undefined' && !!document.documentElement.requestFullscreen

// True once already launched from a home-screen icon - iOS's `navigator.standalone`
// covers Safari/Chrome there, `display-mode` covers everywhere else that supports
// it. No browser chrome exists in this mode, so there's nothing to toggle.
function isStandalone() {
  return (
    typeof window !== 'undefined' &&
    (window.navigator.standalone === true ||
      !!window.matchMedia?.('(display-mode: standalone)').matches)
  )
}

/**
 * Explicit fullscreen entry point, separate from the best-effort
 * auto-enter fired from "Mix a twist" (see useImmersive) - a real tap
 * on this button is a cleaner gesture than that opportunistic one.
 *
 * Touch-primary only, same reasoning as useImmersive: the desktop
 * layout is deliberately a phone-shaped card floating on a backdrop,
 * and must never go fullscreen. Hidden entirely once already
 * standalone (nothing to toggle), and once fullscreen is active: the
 * browser/OS own exit gesture (Escape, Android back) takes over from
 * there instead of us drawing a "minimize" icon.
 *
 * iOS has no requestFullscreen() for page content at all - not a bug,
 * a WebKit platform limit - so there the button instead opens a short
 * "Add to Home Screen" hint, since installing is the only way iOS
 * ever drops its browser chrome.
 */
export function FullscreenToggle() {
  const [isFullscreen, setIsFullscreen] = useState(
    () => SUPPORTS_FULLSCREEN && !!document.fullscreenElement,
  )
  const [showHint, setShowHint] = useState(false)

  useEffect(() => {
    if (!SUPPORTS_FULLSCREEN) return
    const onChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  if (!isTouchPrimary() || isStandalone() || isFullscreen) return null
  if (!SUPPORTS_FULLSCREEN) {
    return (
      <div className="fullscreenToggle__wrap">
        <button
          type="button"
          className="fullscreenToggle"
          onClick={() => setShowHint((v) => !v)}
          aria-label="Fullscreen info"
          title="Fullscreen"
        >
          <span aria-hidden="true">⛶</span>
        </button>
        {showHint && (
          <div className="fullscreenHint" role="dialog" aria-label="Add to Home Screen">
            <p>
              iOS doesn't allow fullscreen in the browser. Tap{' '}
              <span aria-hidden="true">⬆️</span> Share, then{' '}
              <strong>Add to Home Screen</strong> - it opens chrome-free from there.
            </p>
            <button type="button" onClick={() => setShowHint(false)}>
              Got it
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <button
      type="button"
      className="fullscreenToggle"
      onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})}
      aria-label="Enter fullscreen"
      title="Fullscreen"
    >
      <span aria-hidden="true">⛶</span>
    </button>
  )
}
