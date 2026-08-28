import { describe, expect, it } from 'vitest'
import {
  nextDealerIndexAfterMove,
  nextDealerIndexAfterRemoval,
  sanitizePlayersState,
} from './usePlayers.js'

describe('nextDealerIndexAfterRemoval', () => {
  it('shifts left by one when a player before the dealer is removed', () => {
    // [A, B, C, D], dealer C@2, remove A@0 -> C is now at 1
    expect(nextDealerIndexAfterRemoval(2, 0, 3)).toBe(1)
  })

  it('is unaffected when a player after the dealer is removed', () => {
    // [A, B, C, D], dealer B@1, remove D@3 -> B stays at 1
    expect(nextDealerIndexAfterRemoval(1, 3, 3)).toBe(1)
  })

  it('wraps forward to the first player when the dealer was last in the array', () => {
    // [A, B, C, D], dealer D@3, remove D -> next = [A, B, C], wraps to A@0,
    // not backward to C@2 (which a naive Math.min clamp would produce).
    expect(nextDealerIndexAfterRemoval(3, 3, 3)).toBe(0)
  })

  it('lands on 0 when the sole remaining player, who is also dealer, is removed', () => {
    // [A], dealer A@0, remove A -> empty roster, must clamp to 0, not -1.
    expect(nextDealerIndexAfterRemoval(0, 0, 0)).toBe(0)
  })

  it('stays put when the removed player was the dealer but not last', () => {
    // [A, B, C, D], dealer B@1, remove B -> next = [A, C, D], the seat
    // now belongs to whoever shifted into it (C, at the same index 1).
    expect(nextDealerIndexAfterRemoval(1, 1, 3)).toBe(1)
  })
})

describe('nextDealerIndexAfterMove', () => {
  it('follows the dealer when they are the player being moved', () => {
    // 4 players, dealer@3, move index 3 up (direction -1, swaps 3<->2).
    expect(nextDealerIndexAfterMove(3, 3, -1)).toBe(2)
  })

  it('follows the dealer when someone else is swapped into their old slot', () => {
    // dealer@2, move index 3 up (swaps 3<->2) - the dealer (at 2) is
    // pushed to 3 by the swap.
    expect(nextDealerIndexAfterMove(2, 3, -1)).toBe(3)
  })

  it('leaves the dealer index unchanged when the swap does not involve it', () => {
    expect(nextDealerIndexAfterMove(0, 3, -1)).toBe(0)
  })
})

describe('sanitizePlayersState', () => {
  it('returns the default for a missing or corrupt value', () => {
    expect(sanitizePlayersState(null)).toEqual({ players: [], dealerIndex: 0 })
    expect(sanitizePlayersState(undefined)).toEqual({ players: [], dealerIndex: 0 })
    expect(sanitizePlayersState('not an object')).toEqual({ players: [], dealerIndex: 0 })
    expect(sanitizePlayersState(['bare', 'array'])).toEqual({ players: [], dealerIndex: 0 })
    expect(sanitizePlayersState({ players: 'not an array' })).toEqual({
      players: [],
      dealerIndex: 0,
    })
  })

  it('filters out malformed player entries without crashing', () => {
    const stored = {
      players: [
        { id: 'a', name: 'Rohan' },
        { id: 'b', name: '' }, // blank name
        { id: 'c' }, // missing name
        { name: 'NoId' }, // missing id
        null,
        { id: 'd', name: 'Priya' },
      ],
      dealerIndex: 0,
    }
    expect(sanitizePlayersState(stored)).toEqual({
      players: [
        { id: 'a', name: 'Rohan' },
        { id: 'd', name: 'Priya' },
      ],
      dealerIndex: 0,
    })
  })

  it('clamps a dealerIndex that points past the end of the roster', () => {
    const stored = {
      players: [{ id: 'a', name: 'Rohan' }, { id: 'b', name: 'Priya' }],
      dealerIndex: 99,
    }
    expect(sanitizePlayersState(stored).dealerIndex).toBe(1)
  })

  it('clamps a negative or non-integer dealerIndex to 0', () => {
    const players = [{ id: 'a', name: 'Rohan' }]
    expect(sanitizePlayersState({ players, dealerIndex: -5 }).dealerIndex).toBe(0)
    expect(sanitizePlayersState({ players, dealerIndex: 'oops' }).dealerIndex).toBe(0)
    expect(sanitizePlayersState({ players, dealerIndex: 1.5 }).dealerIndex).toBe(0)
  })

  it('forces dealerIndex to 0 for an empty roster regardless of the stored value', () => {
    expect(sanitizePlayersState({ players: [], dealerIndex: 7 }).dealerIndex).toBe(0)
  })
})
