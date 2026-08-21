import { useCallback, useEffect, useState } from 'react'

const KEY = 'mixpatti.muted'

/**
 * Mute preference, remembered between sessions.
 *
 * localStorage can throw in private-browsing modes, so every access is
 * wrapped - a failed read just means "not muted".
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
    try {
      localStorage.setItem(KEY, muted ? '1' : '0')
    } catch {
      /* preference just won't persist */
    }
  }, [muted])

  const toggle = useCallback(() => setMuted((m) => !m), [])

  return [muted, toggle]
}
