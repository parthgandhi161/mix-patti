import { useEffect } from 'react'
import { CardBack } from './Card'
import { checkOnBoot } from '../lib/pwaUpdate'
import { prefersReducedMotion } from '../lib/timing'
import './Boot.css'

// Splash floor so a check that resolves instantly (warm cache, no SW
// yet) doesn't just flash by - skipped under reduced motion, same as
// Mixing.jsx skips its own theatre.
const MIN_VISIBLE_MS = 550

export function Boot({ onReady }) {
  useEffect(() => {
    let cancelled = false
    const minDelay = new Promise((resolve) =>
      setTimeout(resolve, prefersReducedMotion() ? 0 : MIN_VISIBLE_MS),
    )
    Promise.all([checkOnBoot(), minDelay]).then(() => {
      if (!cancelled) onReady()
    })
    return () => {
      cancelled = true
    }
  }, [onReady])

  return (
    <div className="boot">
      <div className="boot__card">
        <CardBack />
      </div>
      <h1 className="boot__wordmark">Mix Patti</h1>
      <p className="boot__status">Checking for updates…</p>
    </div>
  )
}
