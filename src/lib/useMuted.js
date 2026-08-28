import { useCallback, useEffect, useState } from 'react'
import { setMuted as applyMute } from './sound'
import { getStorageItem, setStorageItem } from './storage'

const KEY = 'mixpatti.muted'

/**
 * Mute preference, remembered between sessions.
 *
 * localStorage access goes through src/lib/storage.js, which swallows
 * private-browsing/unavailable-storage errors silently - a failed read
 * just means "not muted" here (getStorageItem returns null, and
 * `null === '1'` is false).
 *
 * This hook also pushes the value into the audio graph, rather than
 * leaving components to guard their own sound calls. Doing it here means
 * it can't be forgotten, and it fires on mount - which is what restores
 * a persisted mute into a context that gets rebuilt after backgrounding.
 */
export function useMuted() {
  const [muted, setMuted] = useState(() => getStorageItem(KEY) === '1')

  useEffect(() => {
    applyMute(muted)
    setStorageItem(KEY, muted ? '1' : '0')
  }, [muted])

  const toggle = useCallback(() => setMuted((m) => !m), [])

  return [muted, toggle]
}
