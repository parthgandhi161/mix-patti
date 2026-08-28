import { useCallback, useEffect, useState } from 'react'
import { getStorageJSON, setStorageJSON } from './storage'

const STATE_KEY = 'mixpatti.players'
const DEFAULT_STATE = { players: [], dealerIndex: 0 }

let idCounter = 0

function makeId() {
  idCounter += 1
  return `p${Date.now()}-${idCounter}`
}

/**
 * Guards a persisted { players, dealerIndex } blob against corruption -
 * same role as pick.js's readState(): a hand-edited or stale value must
 * degrade to something safe, never throw or leave dealerIndex pointing
 * past the end of the roster.
 */
export function sanitizePlayersState(stored) {
  if (!stored || typeof stored !== 'object' || !Array.isArray(stored.players)) {
    return { ...DEFAULT_STATE }
  }
  const players = stored.players.filter(
    (p) => p && typeof p.id === 'string' && typeof p.name === 'string' && p.name.trim(),
  )
  const dealerIndex =
    players.length === 0
      ? 0
      : Math.min(
          Math.max(0, Number.isInteger(stored.dealerIndex) ? stored.dealerIndex : 0),
          players.length - 1,
        )
  return { players, dealerIndex }
}

/**
 * Where the dealer index lands after removing the player at `removedIndex`
 * from a roster that's about to shrink to `nextLength`. Modulo against the
 * POST-removal length, not a Math.min clamp: a clamp produces -1 when the
 * sole remaining player (who is also dealer) is removed, and wraps
 * backward to the wrong person when the dealer was last in the array -
 * modulo handles both correctly in one formula.
 */
export function nextDealerIndexAfterRemoval(prevDealerIndex, removedIndex, nextLength) {
  if (nextLength === 0) return 0
  if (removedIndex < prevDealerIndex) return prevDealerIndex - 1
  if (removedIndex > prevDealerIndex) return prevDealerIndex
  return prevDealerIndex % nextLength
}

/**
 * Where the dealer index lands after swapping the players at `i` and
 * `i + direction` - the dealer designation follows the PERSON through a
 * reorder, not the seat.
 */
export function nextDealerIndexAfterMove(dealerIndex, i, direction) {
  const j = i + direction
  if (dealerIndex === i) return j
  if (dealerIndex === j) return i
  return dealerIndex
}

/**
 * Optional player roster + rotating dealer, remembered in localStorage.
 * Mirrors useMuted.js's shape (lazy init from storage, one effect to
 * persist on change) and pick.js's read-guard discipline. `players` and
 * `dealerIndex` live in one combined useState so actions that must move
 * both together (e.g. the roster's first-ever add also seeds dealerIndex)
 * can't tear across two separate updates.
 */
export function usePlayers() {
  const [state, setState] = useState(() =>
    sanitizePlayersState(getStorageJSON(STATE_KEY, DEFAULT_STATE)),
  )

  useEffect(() => {
    setStorageJSON(STATE_KEY, state)
  }, [state])

  const addPlayer = useCallback((name) => {
    const trimmed = name.trim()
    if (!trimmed) return
    // Generated outside the updater: React 18 StrictMode double-invokes a
    // useState updater function the same way it double-invokes effects, and
    // mutating this module-level counter INSIDE the updater would skip ids
    // on every real call under that double-invoke.
    const id = makeId()
    setState((prev) => ({
      players: [...prev.players, { id, name: trimmed }],
      dealerIndex: prev.players.length === 0 ? 0 : prev.dealerIndex,
    }))
  }, [])

  const renamePlayer = useCallback((id, name) => {
    const trimmed = name.trim()
    if (!trimmed) return
    setState((prev) => ({
      ...prev,
      players: prev.players.map((p) => (p.id === id ? { ...p, name: trimmed } : p)),
    }))
  }, [])

  const removePlayer = useCallback((id) => {
    setState((prev) => {
      const removedIndex = prev.players.findIndex((p) => p.id === id)
      if (removedIndex === -1) return prev
      const players = prev.players.filter((p) => p.id !== id)
      return {
        players,
        dealerIndex: nextDealerIndexAfterRemoval(prev.dealerIndex, removedIndex, players.length),
      }
    })
  }, [])

  const movePlayer = useCallback((id, direction) => {
    setState((prev) => {
      const i = prev.players.findIndex((p) => p.id === id)
      const j = i + direction
      if (i === -1 || j < 0 || j >= prev.players.length) return prev
      const players = prev.players.slice()
      ;[players[i], players[j]] = [players[j], players[i]]
      return {
        players,
        dealerIndex: nextDealerIndexAfterMove(prev.dealerIndex, i, direction),
      }
    })
  }, [])

  const setDealer = useCallback((index) => {
    setState((prev) => {
      if (prev.players.length === 0) return prev
      return { ...prev, dealerIndex: Math.min(Math.max(0, index), prev.players.length - 1) }
    })
  }, [])

  // Never in an effect - called directly from App.jsx's startMix click
  // handler, so StrictMode's dev double-invoke of an effect can't
  // double-advance this. (A double-invoked updater function is harmless:
  // it's pure arithmetic over `prev`, so calling it twice on the same
  // input just produces the same result twice.)
  const advanceDealer = useCallback(() => {
    setState((prev) =>
      prev.players.length === 0
        ? prev
        : { ...prev, dealerIndex: (prev.dealerIndex + 1) % prev.players.length },
    )
  }, [])

  const clearPlayers = useCallback(() => {
    setState({ ...DEFAULT_STATE })
  }, [])

  // Re-clamped here too, belt-and-suspenders against any future bug that
  // leaves dealerIndex out of bounds between renders.
  const dealerName =
    state.players.length === 0
      ? null
      : (state.players[Math.min(Math.max(0, state.dealerIndex), state.players.length - 1)]
          ?.name ?? null)

  return {
    players: state.players,
    dealerIndex: state.dealerIndex,
    dealerName,
    addPlayer,
    renamePlayer,
    removePlayer,
    movePlayer,
    setDealer,
    advanceDealer,
    clearPlayers,
  }
}
