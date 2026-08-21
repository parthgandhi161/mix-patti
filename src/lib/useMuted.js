import { useCallback, useEffect, useState } from 'react'
import { setMuted as applyMute } from './sound'

const KEY = 'mixpatti.muted'

/**
 * Mute preference, remembered between sessions.
 *
 * localStorage can throw in private-browsing modes, so every access is
 * wrapped - a failed read just means "not muted".
 *
 * This hook also pushes the value into the audio graph, rather than
 * leaving components to guard their own sound calls. Doing it here means
 * it can't be forgotten, and it fires on mount - which is what restores
 * a persisted mute into a context that gets rebuilt after backgrounding.
 */
export function useMuted() {
  const [muted, setMuted] = useState(() => {
    try {
      return localStorage.getItem(KEY) === '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    applyMute(muted)
    try {
      localStorage.setItem(KEY, muted ? '1' : '0')
    } catch {
      /* preference just won't persist */
    }
  }, [muted])

  const toggle = useCallback(() => setMuted((m) => !m), [])

  return [muted, toggle]
}
