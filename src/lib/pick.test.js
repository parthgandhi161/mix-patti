import { describe, expect, it, vi } from 'vitest'
import variations from '../data/variations.json'
import { bannedRollRate, pickNext, shuffled } from './pick.js'

const STATE_KEY = 'mixpatti.pickState'

// ---------------------------------------------------------------------------
// Characterisation tests: pin down pick.js's CURRENT observable behaviour
// (return value + localStorage before/after), not a spec written in
// advance. If a test here disagrees with pick.js, the test is wrong.
//
// Randomness strategy:
//  - Aggregate/statistical properties (never-repeats-immediately,
//    bannedRollRate convergence) run pickNext many times with REAL
//    Math.random and a generous tolerance band.
//  - Behaviour that needs a specific setup (stale localStorage shapes,
//    the reroll cap) stubs Math.random with vi.spyOn(Math, 'random').
// ---------------------------------------------------------------------------

describe('pickNext - never repeats the immediately previous id', () => {
  it('never returns the same id twice in a row across many draws', () => {
    let previousId
    for (let i = 0; i < 500; i++) {
      const { variation } = pickNext(variations, previousId)
      if (previousId !== undefined) {
        expect(variation.id).not.toBe(previousId)
      }
      previousId = variation.id
    }
  })
})

describe('pickNext - each shuffle-bag cycles through all its own members before repeating', () => {
  // Synthetic fixtures, not the real 27-entry dataset: enough OTHER
  // entries are marked sideshowBanned: true to hit bannedRollRate()'s 20%
  // target on their own (driving the roll rate to exactly 0 for
  // everyone), while every entry in the bag under test is
  // sideshowBanned: false - so that bag's draws are never `banned` and
  // never trigger a reroll/discard. That makes every draw from the bag
  // under test a real, counted draw, not a filtered subset.
  const bagAUnderTest = ['a1', 'a2', 'a3', 'a4', 'a5']
  const fillerForA = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'f9', 'f10']
  const strictFillerForA = new Set(['f1', 'f2', 'f3']) // 3 of 15 -> rate 0
  const syntheticForBagACycle = [
    ...bagAUnderTest.map((id) => ({ id, priority: 1, sideshowBanned: false })),
    ...fillerForA.map((id) => ({ id, priority: 2, sideshowBanned: strictFillerForA.has(id) })),
  ]

  const bagBUnderTest = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6']
  const fillerForB = ['g1', 'g2', 'g3', 'g4']
  const strictFillerForB = new Set(['g1', 'g2']) // 2 of 10 -> rate 0
  const syntheticForBagBCycle = [
    ...bagBUnderTest.map((id) => ({ id, priority: 2, sideshowBanned: false })),
    ...fillerForB.map((id) => ({ id, priority: 1, sideshowBanned: strictFillerForB.has(id) })),
  ]

  function assertBagCyclesFully(synthetic, isUnderTest, bagSize, iterations = 400) {
    const cycleSeen = new Set()
    let previousId
    for (let i = 0; i < iterations; i++) {
      const { variation } = pickNext(synthetic, previousId)
      previousId = variation.id
      if (!isUnderTest(variation)) continue
      if (cycleSeen.has(variation.id)) {
        expect(cycleSeen.size).toBe(bagSize) // repeat is only legal once full
        cycleSeen.clear()
      }
      cycleSeen.add(variation.id)
    }
    expect(cycleSeen.size).toBeGreaterThan(0) // sanity: bag was exercised
  }

  it('bag A (priority 1) draws every member once before any repeat', () => {
    expect(bannedRollRate(syntheticForBagACycle)).toBe(0)
    assertBagCyclesFully(syntheticForBagACycle, (v) => v.priority === 1, bagAUnderTest.length)
  })

  it('bag B (not priority 1) draws every member once before any repeat', () => {
    expect(bannedRollRate(syntheticForBagBCycle)).toBe(0)
    assertBagCyclesFully(syntheticForBagBCycle, (v) => v.priority !== 1, bagBUnderTest.length)
  })
})

describe('pickNext - a stale persisted bag source is dropped and reshuffled (sameIdSet)', () => {
  // writeState() unconditionally recomputes bagASource/bagBSource fresh
  // on EVERY call, regardless of what readState() did - so asserting on
  // the written source arrays proves nothing about whether the drop
  // logic fired. The only thing that actually differs between "stale
  // pool wrongly reused" and "correctly dropped and reshuffled" is the
  // SIZE of the bag's remaining pool after one forced draw: reuse of a
  // 1-element stale pool leaves 0 remaining; a fresh reshuffle of the
  // full live bag leaves (bagSize - 1) remaining. Math.random is pinned
  // low/high to force which bag gets drawn from, deterministically.
  const bagAIds = variations.filter((v) => v.priority === 1).map((v) => v.id)
  const bagBIds = variations.filter((v) => v.priority !== 1).map((v) => v.id)
  const sampleBagAId = bagAIds[0]
  const sampleBagBId = bagBIds[0]

  it('drops a persisted bagA whose bagASource no longer matches live data', () => {
    localStorage.setItem(STATE_KEY, JSON.stringify({
      bagA: [sampleBagAId], // plausible but stale 1-element "remaining" pool
      bagB: [],
      lastBanned: null,
      bagASource: ['some-completely-different-stale-id'], // mismatched -> drop
      bagBSource: bagBIds,
    }))

    // Force bagKey === 'bagA' every attempt (Math.random() < BAG_A_SHARE=0.2).
    vi.spyOn(Math, 'random').mockReturnValue(0.01)

    pickNext(variations, undefined)

    const written = JSON.parse(localStorage.getItem(STATE_KEY))
    // A correctly-dropped bag reshuffles all of bagAIds and pops one,
    // leaving bagAIds.length - 1. A wrongly-reused stale pool (length 1)
    // would leave 0.
    expect(written.bagA).toHaveLength(bagAIds.length - 1)
  })

  it('drops a persisted bagB whose bagBSource no longer matches live data', () => {
    localStorage.setItem(STATE_KEY, JSON.stringify({
      bagA: [],
      bagB: [sampleBagBId],
      lastBanned: null,
      bagASource: bagAIds,
      bagBSource: ['some-completely-different-stale-id'], // mismatched -> drop
    }))

    // Force bagKey === 'bagB' every attempt (Math.random() >= BAG_A_SHARE=0.2).
    vi.spyOn(Math, 'random').mockReturnValue(0.99)

    pickNext(variations, undefined)

    const written = JSON.parse(localStorage.getItem(STATE_KEY))
    expect(written.bagB).toHaveLength(bagBIds.length - 1)
  })
})

describe('pickNext - legacy shape and corrupt storage fall back to a fresh cycle without throwing', () => {
  it('falls back cleanly for the old bare-array (mixpatti.unseenIds-style) shape', () => {
    localStorage.setItem(STATE_KEY, JSON.stringify(['some', 'old', 'unseen', 'ids']))
    expect(() => pickNext(variations, undefined)).not.toThrow()
    const { variation, sideshowBannedThisRound } = pickNext(variations, undefined)
    expect(variations.some((v) => v.id === variation.id)).toBe(true)
    expect(typeof sideshowBannedThisRound).toBe('boolean')
  })

  it('falls back cleanly for a corrupt, non-JSON-parseable string', () => {
    localStorage.setItem(STATE_KEY, '{not valid json::')
    expect(() => pickNext(variations, undefined)).not.toThrow()
    const { variation } = pickNext(variations, undefined)
    expect(variations.some((v) => v.id === variation.id)).toBe(true)
  })

  it('falls back cleanly when localStorage.getItem itself throws', () => {
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('storage unavailable')
    })
    expect(() => pickNext(variations, undefined)).not.toThrow()
  })
})

describe('bannedRollRate', () => {
  it('returns 0 for an empty list', () => {
    expect(bannedRollRate([])).toBe(0)
  })

  it('returns 0 when every entry is already strict-banned (no eligible pool)', () => {
    const allStrict = variations.map((v) => ({ ...v, sideshowBanned: true }))
    expect(bannedRollRate(allStrict)).toBe(0)
  })

  it('matches the direct formula for the live dataset', () => {
    const total = variations.length
    const strict = variations.filter((v) => v.sideshowBanned === true).length
    const eligible = total - strict
    const expected = Math.min(1, (Math.max(0, 0.2 - strict / total) * total) / eligible)
    expect(bannedRollRate(variations)).toBeCloseTo(expected, 10)
  })

  it('converges the overall banned share on TARGET_BANNED_SHARE (0.2) across many full pickNext calls', () => {
    const trials = 4000
    let bannedCount = 0
    let previousId
    for (let i = 0; i < trials; i++) {
      const { variation, sideshowBannedThisRound } = pickNext(variations, previousId)
      if (sideshowBannedThisRound) bannedCount++
      previousId = variation.id
    }
    const share = bannedCount / trials
    // +-0.05 around the 0.2 target is a generous tolerance for n=4000 -
    // wide enough not to flake, tight enough to catch a real regression.
    expect(share).toBeGreaterThan(0.15)
    expect(share).toBeLessThan(0.25)
  })
})

describe('pickNext - back-to-back strict-banned picks and the reroll cap', () => {
  const alwaysBanned = [
    { id: 'x', priority: 1, sideshowBanned: true },
    { id: 'y', priority: 1, sideshowBanned: true },
  ]

  it('caps the reroll at MAX_REROLL_ATTEMPTS (4) instead of looping forever', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.01)

    // Call 1: fresh state (lastBanned starts null) -> backToBack is false
    // regardless of `banned`, so accepted on attempt 1. Exists only to
    // leave lastBanned = true in persisted state for call 2.
    const first = pickNext(alwaysBanned, undefined)
    expect(first.sideshowBannedThisRound).toBe(true)

    spy.mockClear()

    // Call 2: lastBanned is now true, and both entries are
    // sideshowBanned: true, so EVERY attempt's `banned` is true
    // unconditionally (short-circuits before consuming a Math.random
    // call for the roll). backToBack is true on attempts 1-3 (each
    // rerolled) and attempt 4 is accepted unconditionally.
    //
    // Hand-traced against pick.js's actual source, call by call, with
    // Math.random pinned at 0.01 throughout:
    //   attempt 1: bag-choice only (1 item left over from call 1, so
    //     drawFrom reuses it with no reshuffle)              -> 1 call
    //   attempt 2: bag-choice + reshuffle (bag ran dry - 1
    //     Fisher-Yates step for this 2-item list) + same-as-
    //     previous-id swap-check (the shuffle puts previousId
    //     on top)                                             -> 3 calls
    //   attempt 3: bag-choice only (1 item left over again)   -> 1 call
    //   attempt 4: bag-choice + reshuffle + swap-check, same
    //     shape as attempt 2                                  -> 3 calls
    //   total                                                 -> 8 calls
    const second = pickNext(alwaysBanned, first.variation.id)

    expect(second.sideshowBannedThisRound).toBe(true)
    expect(spy).toHaveBeenCalledTimes(8)
  })

  it('terminates promptly under worst-case back-to-back conditions (no infinite loop)', () => {
    let previousId
    for (let i = 0; i < 50; i++) {
      const { variation } = pickNext(alwaysBanned, previousId)
      previousId = variation.id
    }
  }, 2000)

  it('back-to-back strict-banned results are rare (not eliminated) under real data', () => {
    let previousId
    let previousWasStrict = false
    let backToBackStrict = 0
    const trials = 5000
    for (let i = 0; i < trials; i++) {
      const { variation } = pickNext(variations, previousId)
      const strict = variation.sideshowBanned === true
      if (strict && previousWasStrict) backToBackStrict++
      previousWasStrict = strict
      previousId = variation.id
    }
    // No hard guarantee (attempt 4 always accepts) - assert "rare", not
    // "zero", with a generously safe upper bound relative to trials.
    expect(backToBackStrict).toBeLessThan(trials * 0.01)
  })
})

describe('shuffled', () => {
  it('returns a permutation of the input - same items, same length', () => {
    const items = variations.map((v) => v.id)
    const result = shuffled(items)
    expect(result).toHaveLength(items.length)
    expect([...result].sort()).toEqual([...items].sort())
  })

  it('does not mutate the input array', () => {
    const items = ['a', 'b', 'c']
    const copy = [...items]
    shuffled(items)
    expect(items).toEqual(copy)
  })
})
