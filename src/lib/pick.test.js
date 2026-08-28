import { describe, expect, it, vi } from 'vitest'
import variations from '../data/variations.json'
import { MIN_UNMUTED, bannedRollRate, pickNext, shuffled } from './pick.js'

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
    // Both fixture entries are priority: 1, so bagB/bagStar are empty
    // (starredIds defaults to [] too) - every attempt's bag-choice roll
    // picks bagA, with no extra Math.random cost from the starred
    // pre-roll (starEligible is false, so `useStarred` short-circuits
    // before ever calling Math.random).
    //
    // Call 1 left bagA holding 1 leftover id (whichever of x/y wasn't
    // drawn) - call it `leftover`, and `first.variation.id` (== this
    // call's previousId) is the OTHER one, already popped out of bagA.
    //
    // Hand-traced against pick.js's actual source, call by call, with
    // Math.random pinned at 0.01 throughout - drawFrom()'s reshuffle
    // guard now also fires whenever exactly one id is left AND it equals
    // previousId (not just when the bag is fully empty), which this
    // fixture hits from attempt 3 onward, once bagA cycles back around
    // to holding only previousId as its sole leftover:
    //   attempt 1: bag-choice + drawFrom reuses the 1-item
    //     `remaining` as-is (it's `leftover`, which isn't
    //     previousId, so the new guard doesn't force a
    //     reshuffle here) - no swap needed either (top === 0)  -> 1 call
    //   attempt 2: bag-choice + reshuffle (bagA ran dry) +
    //     same-as-previous-id swap-check (the shuffle puts
    //     previousId on top) - the swap sets previousId aside
    //     as bagA's new 1-item leftover                        -> 3 calls
    //   attempt 3: bag-choice + reshuffle (bagA's leftover IS
    //     previousId now, so the hardened guard forces a fresh
    //     reshuffle instead of reusing it) + swap-check         -> 3 calls
    //   attempt 4: bag-choice + reshuffle + swap-check, same
    //     shape as attempt 3                                   -> 3 calls
    //   total                                                  -> 10 calls
    const second = pickNext(alwaysBanned, first.variation.id)

    expect(second.sideshowBannedThisRound).toBe(true)
    expect(spy).toHaveBeenCalledTimes(10)
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

describe('pickNext - muting', () => {
  it('never draws a muted id across many draws', () => {
    const mutedIds = variations.slice(0, 6).map((v) => v.id) // well above MIN_UNMUTED for this 27-entry dataset
    const mutedSet = new Set(mutedIds)
    let previousId
    for (let i = 0; i < 1000; i++) {
      const { variation } = pickNext(variations, previousId, { mutedIds })
      expect(mutedSet.has(variation.id)).toBe(false)
      previousId = variation.id
    }
  })

  it('computes bannedRollRate over the unmuted set, not the full dataset', () => {
    // 10 synthetic entries, exactly 2 sideshowBanned: true - the strict
    // share alone already hits TARGET_BANNED_SHARE (0.2), so
    // bannedRollRate on the FULL list is 0 (shortfall clamps to 0, no
    // extra roll needed or possible). Muting away those exact 2 strict
    // entries removes the strict share entirely; if the roll rate is
    // correctly recomputed over the remaining 8 (all sideshowBanned:
    // false), it should roll back up to ~20% via the coin flip instead.
    // A bug that kept computing the rate from the full, unfiltered list
    // would see this stay at ~0%.
    const strictIds = ['s1', 's2']
    const synthetic = [
      ...strictIds.map((id) => ({ id, priority: 2, sideshowBanned: true })),
      ...Array.from({ length: 8 }, (_, i) => ({
        id: `f${i}`,
        priority: 2,
        sideshowBanned: false,
      })),
    ]
    expect(bannedRollRate(synthetic)).toBe(0)

    let bannedCount = 0
    let previousId
    const trials = 4000
    for (let i = 0; i < trials; i++) {
      const { variation, sideshowBannedThisRound } = pickNext(synthetic, previousId, {
        mutedIds: strictIds,
      })
      if (sideshowBannedThisRound) bannedCount++
      previousId = variation.id
    }
    const share = bannedCount / trials
    expect(share).toBeGreaterThan(0.15)
    expect(share).toBeLessThan(0.25)
  })
})

describe('pickNext - the mute floor (MIN_UNMUTED)', () => {
  it('ignores the mute set entirely when it would leave nothing unmuted', () => {
    const mutedIds = variations.map((v) => v.id) // mute everything
    expect(() => pickNext(variations, undefined, { mutedIds })).not.toThrow()
    const { variation } = pickNext(variations, undefined, { mutedIds })
    expect(variations.some((v) => v.id === variation.id)).toBe(true)
  })

  it('ignores the mute set entirely when it would leave fewer than MIN_UNMUTED unmuted', () => {
    expect(MIN_UNMUTED).toBe(2) // pin the exact floor this test exercises
    const mutedIds = variations.slice(1).map((v) => v.id) // mutes all but 1 -> unmutedCount 1 < MIN_UNMUTED
    const solelyUnmutedId = variations[0].id
    let sawSomethingElse = false
    let previousId
    for (let i = 0; i < 200; i++) {
      const { variation } = pickNext(variations, previousId, { mutedIds })
      if (variation.id !== solelyUnmutedId) sawSomethingElse = true
      previousId = variation.id
    }
    // If the mute set were honored (wrongly) at this count, every draw
    // would be forced onto the one "unmuted" id. Seeing anything else
    // proves the floor fired and the mute set was ignored outright.
    expect(sawSomethingElse).toBe(true)
  })

  it('honors the mute set right at the floor - exactly MIN_UNMUTED unmuted', () => {
    const unmutedIds = variations.slice(0, 2).map((v) => v.id)
    const unmutedSet = new Set(unmutedIds)
    const mutedIds = variations.slice(2).map((v) => v.id) // leaves exactly 2 unmuted
    let previousId
    for (let i = 0; i < 200; i++) {
      const { variation } = pickNext(variations, previousId, { mutedIds })
      expect(unmutedSet.has(variation.id)).toBe(true)
      previousId = variation.id
    }
  })
})

describe('pickNext - starring', () => {
  it('a single starred twist never repeats back-to-back (starEligible gate holds)', () => {
    // With only 1 eligible starred id, bagStar can never be drawn from at
    // all (starEligible requires >= 2) - this pins that the pre-roll
    // really is skipped outright, not just "less likely": without that
    // gate, a lone starred id's bag would legally repeat itself.
    const starredIds = [variations[0].id]
    let previousId
    for (let i = 0; i < 2000; i++) {
      const { variation } = pickNext(variations, previousId, { starredIds })
      if (previousId !== undefined) {
        expect(variation.id).not.toBe(previousId)
      }
      previousId = variation.id
    }
  })

  it('draws a starred id at roughly STARRED_SHARE (0.3) when at least 2 are eligible', () => {
    const starredIds = variations.slice(0, 2).map((v) => v.id)
    const starredSet = new Set(starredIds)
    let starredCount = 0
    let previousId
    const trials = 6000
    for (let i = 0; i < trials; i++) {
      const { variation } = pickNext(variations, previousId, { starredIds })
      if (starredSet.has(variation.id)) starredCount++
      previousId = variation.id
    }
    const share = starredCount / trials
    // STARRED_SHARE (0.3) is a private constant, hardcoded here as a
    // literal - same convention as TARGET_BANNED_SHARE's 0.2 elsewhere in
    // this file. The true share is slightly ABOVE 0.3: a starred id can
    // also be drawn via the ordinary bagA/bagB path on the ~70% of
    // attempts the starred pre-roll misses. The tolerance band is wide
    // enough to absorb that plus statistical noise without masking a real
    // regression (e.g. the pre-roll not firing at all, which would drop
    // this down to each item's tiny natural bagA/bagB share instead).
    expect(share).toBeGreaterThan(0.25)
    expect(share).toBeLessThan(0.45)
  })
})

describe('pickNext - a stale persisted bagStarSource is dropped and reshuffled', () => {
  it('drops a persisted bagStar whose bagStarSource no longer matches the live starred set', () => {
    const starredIds = variations.slice(0, 3).map((v) => v.id) // >= 2, satisfies starEligible
    localStorage.setItem(
      STATE_KEY,
      JSON.stringify({
        bagA: [],
        bagB: [],
        bagStar: [starredIds[0]], // plausible but stale 1-element "remaining" pool
        lastBanned: null,
        bagASource: variations.filter((v) => v.priority === 1).map((v) => v.id),
        bagBSource: variations.filter((v) => v.priority !== 1).map((v) => v.id),
        bagStarSource: ['some-completely-different-stale-id'], // mismatched -> drop
      }),
    )

    // Force useStarred === true every attempt (starEligible is true here,
    // and 0.01 < STARRED_SHARE 0.3).
    vi.spyOn(Math, 'random').mockReturnValue(0.01)

    pickNext(variations, undefined, { starredIds })

    const written = JSON.parse(localStorage.getItem(STATE_KEY))
    // A correctly-dropped bag reshuffles all of starredIds and pops one,
    // leaving starredIds.length - 1. A wrongly-reused stale pool
    // (length 1) would leave 0.
    expect(written.bagStar).toHaveLength(starredIds.length - 1)
  })

  it('falls back cleanly when upgrading a pre-star pickState blob (no bagStar/bagStarSource fields)', () => {
    localStorage.setItem(
      STATE_KEY,
      JSON.stringify({
        bagA: [],
        bagB: [],
        lastBanned: null,
        bagASource: variations.filter((v) => v.priority === 1).map((v) => v.id),
        bagBSource: variations.filter((v) => v.priority !== 1).map((v) => v.id),
        // no bagStar / bagStarSource - this is what mixpatti.pickState
        // looked like before starring existed.
      }),
    )
    const starredIds = variations.slice(0, 2).map((v) => v.id)
    expect(() => pickNext(variations, undefined, { starredIds })).not.toThrow()
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
