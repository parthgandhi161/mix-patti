import { useCallback, useEffect, useState } from 'react'
import { MIN_UNMUTED } from './pick'
import { getStorageJSON, setStorageJSON } from './storage'

const STARRED_KEY = 'mixpatti.starredVariations'
const MUTED_KEY = 'mixpatti.mutedVariations'

// Deliberately NOT mixpatti.muted / useMuted - that key and hook already
// mean "audio is muted" (src/lib/useMuted.js). This is a different concept
// (excluded from the draw) that happens to share the English word.

/** Guards a persisted id-array against corruption - same role as pick.js's readState(). */
export function sanitizeIdList(stored) {
  if (!Array.isArray(stored)) return []
  return stored.filter((id) => typeof id === 'string')
}

/**
 * Whether `id` may be (un)muted, given the CURRENT mutedIds and the total
 * variation count - extracted as a pure function (rather than left inline
 * in the hook below) so it can be unit tested directly, the same way
 * usePlayers.js pulls its dealer-index arithmetic out into standalone
 * exports. Mirrors pick.js's effectiveMutedSet() floor: unmuting is
 * always allowed, muting one more is only allowed while more than
 * MIN_UNMUTED would remain unmuted afterward.
 */
export function canToggleMuteId(id, mutedIds, totalCount) {
  if (mutedIds.includes(id)) return true
  const unmutedCount = totalCount - mutedIds.length
  return unmutedCount > MIN_UNMUTED
}

/**
 * Per-browser starred/muted preferences for variations, remembered in
 * localStorage. Mirrors usePlayers.js's shape (lazy init from storage, one
 * effect per set to persist) rather than useMuted.js's raw-string shape,
 * since these are id-arrays, not a single boolean.
 *
 * `canToggleMute(id)` enforces the same MIN_UNMUTED floor pick.js's
 * effectiveMutedSet() falls back to - imported from there, not
 * re-declared, so the UI's greyed-out control and pick.js's own backstop
 * can never drift apart. Unmuting is always allowed; muting one more is
 * only allowed while more than MIN_UNMUTED would remain unmuted.
 * `toggleMuted` checks this itself before applying, as a second line of
 * defense even though callers are expected to disable the control first.
 */
export function useVariationPrefs(variations) {
  const [starredIds, setStarredIds] = useState(() =>
    sanitizeIdList(getStorageJSON(STARRED_KEY, [])),
  )
  const [mutedIds, setMutedIds] = useState(() => sanitizeIdList(getStorageJSON(MUTED_KEY, [])))

  useEffect(() => {
    setStorageJSON(STARRED_KEY, starredIds)
  }, [starredIds])

  useEffect(() => {
    setStorageJSON(MUTED_KEY, mutedIds)
  }, [mutedIds])

  const isStarred = useCallback((id) => starredIds.includes(id), [starredIds])
  const isMuted = useCallback((id) => mutedIds.includes(id), [mutedIds])

  const canToggleMute = useCallback(
    (id) => canToggleMuteId(id, mutedIds, variations.length),
    [variations, mutedIds],
  )

  const toggleStarred = useCallback((id) => {
    setStarredIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }, [])

  const toggleMuted = useCallback(
    (id) => {
      if (!canToggleMute(id)) return
      setMutedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
    },
    [canToggleMute],
  )

  return { starredIds, mutedIds, isStarred, isMuted, toggleStarred, toggleMuted, canToggleMute }
}
