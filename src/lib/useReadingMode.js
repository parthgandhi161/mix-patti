import { useCallback, useEffect, useState } from 'react'
import { getStorageItem, setStorageItem } from './storage'

const KEY = 'mixpatti.rulesMode'

/**
 * RulesSheet's dense-vs-explain reading mode, remembered between
 * sessions - same shape as useMuted.js. Anything other than the exact
 * stored string 'explain' (missing key, corrupted value, private
 * browsing) falls back to 'read', which is today's existing behavior.
 */
export function useReadingMode() {
  const [mode, setMode] = useState(() =>
    getStorageItem(KEY) === 'explain' ? 'explain' : 'read'
  )

  useEffect(() => {
    setStorageItem(KEY, mode)
  }, [mode])

  const toggle = useCallback(
    () => setMode((m) => (m === 'read' ? 'explain' : 'read')),
    []
  )

  return [mode, toggle]
}
