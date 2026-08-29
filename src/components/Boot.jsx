import { useEffect, useState } from 'react'
import { CardBack } from './Card'
import { checkOnBoot, onBootUpdateFound } from '../lib/pwaUpdate'
import { prefersReducedMotion } from '../lib/timing'
import './Boot.css'

// Splash floor so a launch that resolves near-instantly (warm cache, no
// SW yet) still reads as a deliberate boot beat rather than a blink -
// skipped under reduced motion, same as Mixing.jsx skips its own theatre.
const MIN_VISIBLE_MS = 900

export function Boot({ onReady }) {
  const [status, setStatus] = useState('Checking for updates…')

  useEffect(() => {
    let cancelled = false
    // Only fires if the boot-time check actually finds a new build -
    // otherwise the splash clears on the fast path below and this never
    // gets the chance to matter.
    onBootUpdateFound(() => {
      if (!cancelled) setStatus('Updating…')
    })
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
      <p className="boot__status">{status}</p>
    </div>
  )
}
