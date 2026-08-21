import { useEffect, useState } from 'react'
import { isTouchPrimary } from '../lib/immersive'
import './FullscreenToggle.css'

const SUPPORTS_FULLSCREEN =
  typeof document !== 'undefined' && !!document.documentElement.requestFullscreen

/**
 * Explicit fullscreen entry point, separate from the best-effort
 * auto-enter fired from "Mix a twist" (see useImmersive) - a real tap
 * on this button is a cleaner gesture than that opportunistic one.
 *
 * Touch-primary only, same reasoning as useImmersive: the desktop
 * layout is deliberately a phone-shaped card floating on a backdrop,
 * and must never go fullscreen. Hidden entirely (not disabled) when
 * unsupported - notably iOS Safari - rather than showing a dead
 * button, and hidden again once fullscreen is active: the browser/OS
 * own exit gesture (Escape, Android back) takes over from there
 * instead of us drawing a "minimize" icon.
 */
export function FullscreenToggle() {
  const [isFullscreen, setIsFullscreen] = useState(
    () => SUPPORTS_FULLSCREEN && !!document.fullscreenElement,
  )

  useEffect(() => {
    if (!SUPPORTS_FULLSCREEN) return
    const onChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  if (!SUPPORTS_FULLSCREEN || !isTouchPrimary() || isFullscreen) return null

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
