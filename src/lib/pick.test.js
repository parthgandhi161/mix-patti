import { describe, expect, it, vi } from 'vitest'
import variations from '../data/variations.json'
import {
  MIN_UNMUTED,
  TARGET_BANNED_SHARE,
  bannedRollRate,
  historyWindowSize,
  pickNext,
  requiredPerDrawRate,
  shuffled,
} from './pick.js'

const STATE_KEY = 'mixpatti.pickState'

// ---------------------------------------------------------------------------
// Characterisation tests: pin down pick.js's CURRENT observable behaviour
// (return value + sessionStorage before/after), not a spec written in
// advance. If a test here disagrees with pick.js, the test is wrong.
//
// Randomness strategy:
//  - Aggregate/statistical properties (never-repeats-immediately,
//    bannedRollRate convergence) run pickNext many times with REAL
//    Math.random and a generous tolerance band.
//  - Behaviour that needs a specific setup (stale sessionStorage shapes,
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

describe('pickNext - persists its draw state to sessionStorage, not localStorage', () => {
  // A user asked for the shuffle-bag/sideshow-ban state to start fresh
  // every time the app is genuinely reopened (a new PWA launch, a new
  // tab) rather than carrying over indefinitely. sessionStorage is what
  // gives that for free: it resets on a real new session but still
  // survives an in-page reload - unlike localStorage, which every OTHER
  // piece of this app's persisted state (starred/muted prefs, players,
  // etc) deliberately keeps using. This pins pick.js to the right store.
  it('writes mixpatti.pickState to sessionStorage and leaves localStorage untouched', () => {
    expect(localStorage.getItem(STATE_KEY)).toBeNull()
    expect(sessionStorage.getItem(STATE_KEY)).toBeNull()

    pickNext(variations, undefined)

    expect(sessionStorage.getItem(STATE_KEY)).not.toBeNull()
    expect(localStorage.getItem(STATE_KEY)).toBeNull()
  })

  it('ignores a value seeded in localStorage under the same key (reads from sessionStorage only)', () => {
    const bagMainIds = variations.map((v) => v.id)
    // bagMainSource here DOES match live data, with a plausible 1-item
    // "remaining" pool - if this were wrongly read (from localStorage
    // instead of sessionStorage), sameIdMultiset would consider it fresh
    // and reuse that 1-item pool as-is instead of reshuffling.
    localStorage.setItem(
      STATE_KEY,
      JSON.stringify({
        bagMain: [bagMainIds[0]],
        lastBanned: null,
        bagMainSource: bagMainIds,
      }),
    )

    pickNext(variations, undefined)

    const written = JSON.parse(sessionStorage.getItem(STATE_KEY))
    // Correctly ignoring the localStorage value means sessionStorage was
    // empty, forcing a fresh reshuffle of the whole bag before popping
    // one - leaving bagMainIds.length - 1 remaining. Wrongly reading the
    // seeded localStorage value would reuse its 1-item pool instead,
    // leaving 0.
    expect(written.bagMain).toHaveLength(bagMainIds.length - 1)
  })
})

describe('pickNext - the main bag cycles through (nearly) all its own members before repeating', () => {
  // There is only one non-star bag now (bagMain, priority's old A/B split is
  // gone) - and bagMain's source is exactly `unmuted`, the SAME set
  // bannedRollRate() draws its strict/total ratio from. Unlike the old
  // two-bag design, there's no longer a separate "filler" bag to dump
  // strict-banned entries into while keeping the tracked bag itself
  // strict-free, so a nonzero bannedRollRate (and hence the occasional
  // sideshow-ban reroll) can't be fully engineered away here. A rerolled
  // attempt still pops its draw off bagMain before looping for a fresh one
  // (see pickNext's own doc comment) - that id is silently consumed
  // without ever being RETURNED, so a "full cycle" as observed through
  // pickNext's return value can run a few members short. That's a real,
  // accepted characteristic of the collapsed single-bag design, not a test
  // bug - so this asserts "close to a full cycle" ON AVERAGE, not an exact
  // count and not a per-cycle worst case: raising TARGET_BANNED_SHARE (see
  // requiredPerDrawRate()) roughly doubled the per-draw banned probability
  // for an all-non-strict synthetic bag like this one, which raises the
  // swallow rate enough that any SINGLE cycle's size varies a lot - the
  // average across many cycles is what stays stable.
  const SWALLOW_TOLERANCE = 6

  it('a repeat only happens once most of the bag has been drawn, on average', () => {
    const bagSize = 20
    const synthetic = Array.from({ length: bagSize }, (_, i) => ({
      id: `v${i}`,
      sideshowBanned: false,
    }))

    const cycleSeen = new Set()
    let previousId
    let cyclesCompleted = 0
    let totalDistinctAcrossCycles = 0
    for (let i = 0; i < 8000; i++) {
      const { variation } = pickNext(synthetic, previousId)
      previousId = variation.id
      if (cycleSeen.has(variation.id)) {
        totalDistinctAcrossCycles += cycleSeen.size
        cycleSeen.clear()
        cyclesCompleted++
      }
      cycleSeen.add(variation.id)
    }
    expect(cyclesCompleted).toBeGreaterThan(20) // sanity: plenty of real cycle boundaries
    const avgDistinctPerCycle = totalDistinctAcrossCycles / cyclesCompleted
    expect(avgDistinctPerCycle).toBeGreaterThanOrEqual(bagSize - SWALLOW_TOLERANCE)
  })
})

describe("pickNext - the main bag's recent-history window avoids repeating the outgoing cycle's tail at the front of the next cycle", () => {
  // Same swallow caveat as the "cycles fully" test above - a rerolled draw
  // is invisible to this test but IS folded into drawFrom()'s real
  // avoidance history (see drawFrom()'s own comment: a discarded attempt's
  // id still updates bag<Key>History before the loop tries again), so the
  // structural guarantee genuinely holds internally. What this test can
  // observe from the outside is closer to it: overlap should stay RARE,
  // not necessarily zero on every single transition.
  function assertRareTailHeadOverlap(synthetic, windowSize, iterations, maxOverlapFraction) {
    const cycles = []
    let current = []
    const seen = new Set()
    let previousId
    for (let i = 0; i < iterations; i++) {
      const { variation } = pickNext(synthetic, previousId)
      previousId = variation.id
      if (seen.has(variation.id)) {
        cycles.push(current)
        current = []
        seen.clear()
      }
      current.push(variation.id)
      seen.add(variation.id)
    }
    expect(cycles.length).toBeGreaterThan(20) // sanity: plenty of real boundaries

    let overlapCount = 0
    let checkedSlots = 0
    for (let i = 0; i < cycles.length - 1; i++) {
      const outgoingTail = new Set(cycles[i].slice(-windowSize))
      const incomingHead = cycles[i + 1].slice(0, windowSize)
      for (const id of incomingHead) {
        checkedSlots++
        if (outgoingTail.has(id)) overlapCount++
      }
    }
    // A completely broken avoidance mechanism (or none at all) would land
    // an overlap at roughly windowSize/bagSize per slot by pure chance -
    // this threshold sits well below that baseline, so it still catches a
    // real regression while absorbing the rare swallow-driven mismatch.
    expect(overlapCount / checkedSlots).toBeLessThan(maxOverlapFraction)
  }

  it('mirrors the live main bag (N=32, K=5)', () => {
    const bagIds = Array.from({ length: 32 }, (_, i) => `m${i}`)
    const synthetic = bagIds.map((id) => ({ id, sideshowBanned: false }))
    expect(historyWindowSize(bagIds)).toBe(5)
    assertRareTailHeadOverlap(synthetic, 5, 6000, 0.13)
  })

  it('a small bag still gets a minimal window (N=4, K=1)', () => {
    const bagIds = Array.from({ length: 4 }, (_, i) => `s${i}`)
    const synthetic = bagIds.map((id) => ({ id, sideshowBanned: false }))
    expect(historyWindowSize(bagIds)).toBe(1)
    assertRareTailHeadOverlap(synthetic, 1, 3000, 0.08)
  })

  it('does not throw when a persisted history is longer than the window and gets clamped', () => {
    const bagMainIds = variations.map((v) => v.id)
    sessionStorage.setItem(
      STATE_KEY,
      JSON.stringify({
        bagMain: [], // empty -> forces a reshuffle, the only branch that reads history
        bagMainHistory: bagMainIds, // pathologically long: the bag's ENTIRE own membership
        lastBanned: null,
        bagMainSource: bagMainIds,
      }),
    )
    const { variation } = pickNext(variations, undefined)
    expect(bagMainIds).toContain(variation.id)
  })
})

describe('pickNext - a stale persisted bag source is dropped and reshuffled (sameIdMultiset)', () => {
  // writeState() unconditionally recomputes bagMainSource fresh on EVERY
  // call, regardless of what readState() did - so asserting on the written
  // source array proves nothing about whether the drop logic fired. The
  // only thing that actually differs between "stale pool wrongly reused"
  // and "correctly dropped and reshuffled" is the SIZE of the bag's
  // remaining pool after one forced draw: reuse of a 1-element stale pool
  // leaves 0 remaining; a fresh reshuffle of the full live bag leaves
  // (bagSize - 1) remaining.
  const bagMainIds = variations.map((v) => v.id)
  const sampleId = bagMainIds[0]

  it('drops a persisted bagMain whose bagMainSource no longer matches live data', () => {
    sessionStorage.setItem(STATE_KEY, JSON.stringify({
      bagMain: [sampleId], // plausible but stale 1-element "remaining" pool
      lastBanned: null,
      bagMainSource: ['some-completely-different-stale-id'], // mismatched -> drop
    }))

    pickNext(variations, undefined)

    const written = JSON.parse(sessionStorage.getItem(STATE_KEY))
    // A correctly-dropped bag reshuffles all of bagMainIds and pops one,
    // leaving bagMainIds.length - 1. A wrongly-reused stale pool (length 1)
    // would leave 0.
    expect(written.bagMain).toHaveLength(bagMainIds.length - 1)
  })

  it('also drops a persisted bagMainHistory whose bagMainSource no longer matches live data', () => {
    sessionStorage.setItem(STATE_KEY, JSON.stringify({
      bagMain: [sampleId],
      bagMainHistory: ['not-even-a-real-bagMain-id'], // proves it's dropped, not coincidentally unused
      lastBanned: null,
      bagMainSource: ['some-completely-different-stale-id'], // mismatched -> drop
    }))

    const { variation } = pickNext(variations, undefined)

    const written = JSON.parse(sessionStorage.getItem(STATE_KEY))
    // A correctly-dropped history starts this round's ring buffer fresh -
    // just this draw. A wrongly-carried-over stale array would still hold
    // 'not-even-a-real-bagMain-id'.
    expect(written.bagMainHistory).toEqual([variation.id])
  })

  it('detects a change in WHICH id is duplicated even when the overall id set is unchanged', () => {
    // A starred id is listed twice in bagMain's source list (see
    // STARRED_MULTIPLIER) - re-starring a DIFFERENT id changes which id is
    // duplicated without changing the set of ids present at all. A plain
    // Set-membership comparison (the old sameIdSet) would miss this
    // entirely: both the stale and the live source contain exactly the
    // same ids, just with a different one repeated. sameIdMultiset()
    // exists specifically to catch it.
    const idA = variations[0].id
    const idB = variations[1].id
    const staleSourceWithADuplicated = [...bagMainIds, idA]
    sessionStorage.setItem(
      STATE_KEY,
      JSON.stringify({
        bagMain: [idA], // stale 1-element pool - would wrongly survive a Set-only check
        lastBanned: null,
        bagMainSource: staleSourceWithADuplicated,
      }),
    )

    // Star idB instead of idA - same overall id set, different duplicate.
    pickNext(variations, undefined, { starredIds: [idB] })

    const written = JSON.parse(sessionStorage.getItem(STATE_KEY))
    // Correctly dropped: reshuffles the fresh (bagMainIds.length + 1)
    // source (idB duplicated) and pops one, leaving bagMainIds.length. A
    // wrongly-reused stale pool (length 1) would leave 0.
    expect(written.bagMain).toHaveLength(bagMainIds.length)
  })
})

describe('pickNext - legacy shape and corrupt storage fall back to a fresh cycle without throwing', () => {
  it('falls back cleanly for the old bare-array (mixpatti.unseenIds-style) shape', () => {
    sessionStorage.setItem(STATE_KEY, JSON.stringify(['some', 'old', 'unseen', 'ids']))
    expect(() => pickNext(variations, undefined)).not.toThrow()
    const { variation, sideshowBannedThisRound } = pickNext(variations, undefined)
    expect(variations.some((v) => v.id === variation.id)).toBe(true)
    expect(typeof sideshowBannedThisRound).toBe('boolean')
  })

  it('falls back cleanly for a corrupt, non-JSON-parseable string', () => {
    sessionStorage.setItem(STATE_KEY, '{not valid json::')
    expect(() => pickNext(variations, undefined)).not.toThrow()
    const { variation } = pickNext(variations, undefined)
    expect(variations.some((v) => v.id === variation.id)).toBe(true)
  })

  it('falls back cleanly when sessionStorage.getItem itself throws', () => {
    vi.spyOn(sessionStorage, 'getItem').mockImplementation(() => {
      throw new Error('storage unavailable')
    })
    expect(() => pickNext(variations, undefined)).not.toThrow()
  })

  it('falls back cleanly for a current-shape blob missing the newer bagMainHistory field', () => {
    sessionStorage.setItem(
      STATE_KEY,
      JSON.stringify({
        bagMain: [],
        lastBanned: null,
        bagMainSource: variations.map((v) => v.id),
        // no bagMainHistory - this is what mixpatti.pickState looked like
        // before the anti-clustering window.
      }),
    )
    expect(() => pickNext(variations, undefined)).not.toThrow()
  })

  it('falls back cleanly for a pre-collapse blob (old bagA/bagB shape, no bagMain/bagMainSource)', () => {
    // variation.priority is gone too, so this old shape's bagASource /
    // bagBSource split can't even be reconstructed from live data anymore -
    // moot, since sameIdMultiset(undefined, bagSourceIds.bagMain) is false
    // unconditionally and readState() falls straight through to a fresh
    // bagMain cycle. No migration code needed for this - see readState()'s
    // own comment.
    sessionStorage.setItem(
      STATE_KEY,
      JSON.stringify({
        bagA: [],
        bagB: [],
        bagAHistory: [],
        bagBHistory: [],
        lastBanned: null,
        bagASource: variations.slice(0, 6).map((v) => v.id),
        bagBSource: variations.slice(6).map((v) => v.id),
      }),
    )
    expect(() => pickNext(variations, undefined)).not.toThrow()
    const { variation } = pickNext(variations, undefined)
    expect(variations.some((v) => v.id === variation.id)).toBe(true)
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
    const perDrawTarget = requiredPerDrawRate(TARGET_BANNED_SHARE)
    const expected = Math.min(1, (Math.max(0, perDrawTarget - strict / total) * total) / eligible)
    expect(bannedRollRate(variations)).toBeCloseTo(expected, 10)
  })

  it('converges the overall banned share on TARGET_BANNED_SHARE (0.33) across many full pickNext calls', () => {
    expect(TARGET_BANNED_SHARE).toBe(0.33) // pin the exact target this test converges on
    const trials = 4000
    let bannedCount = 0
    let previousId
    for (let i = 0; i < trials; i++) {
      const { variation, sideshowBannedThisRound } = pickNext(variations, previousId)
      if (sideshowBannedThisRound) bannedCount++
      previousId = variation.id
    }
    const share = bannedCount / trials
    // +-0.05 around the 0.33 target is a generous tolerance for n=4000 -
    // wide enough not to flake, tight enough to catch a real regression.
    expect(share).toBeGreaterThan(0.28)
    expect(share).toBeLessThan(0.38)
  })
})

describe('requiredPerDrawRate', () => {
  // pickNext()'s reroll suppresses two banned results landing back-to-back,
  // which pulls the steady-state OBSERVED banned share below the raw
  // per-draw probability that feeds it - discovered while raising
  // TARGET_BANNED_SHARE from 0.2 to 0.33: naively using 0.33 as the
  // per-draw probability only converged to an observed ~0.25 share (see
  // the Markov-chain derivation in pick.js's own doc comment). These pin
  // the inversion this function performs to correct for that.

  it('requires a HIGHER per-draw rate than the target share, since the reroll suppresses some of it', () => {
    expect(requiredPerDrawRate(0.33)).toBeGreaterThan(0.33)
  })

  it('feeding its own output back through the steady-state formula recovers the original target', () => {
    const MAX_REROLL_ATTEMPTS = 4 // mirrors pick.js's own private constant
    for (const target of [0.05, 0.2, 0.33, 0.5, 0.8]) {
      const p = requiredPerDrawRate(target)
      const recovered = p / (1 + p - p ** MAX_REROLL_ATTEMPTS)
      expect(recovered).toBeCloseTo(target, 3)
    }
  })

  it('is monotonically increasing - a higher target always needs a higher per-draw rate', () => {
    const targets = [0.05, 0.1, 0.2, 0.33, 0.5, 0.7, 0.9]
    const rates = targets.map((t) => requiredPerDrawRate(t))
    for (let i = 1; i < rates.length; i++) {
      expect(rates[i]).toBeGreaterThan(rates[i - 1])
    }
  })

  it('clamps the trivial edges: 0 stays 0, 1 (or above) stays 1', () => {
    expect(requiredPerDrawRate(0)).toBe(0)
    expect(requiredPerDrawRate(1)).toBe(1)
  })
})

describe('historyWindowSize', () => {
  function idsOfLength(n) {
    return Array.from({ length: n }, (_, i) => `id${i}`)
  }

  it('scales as floor(N/3) below the HISTORY_WINDOW_TARGET cap', () => {
    expect(historyWindowSize(idsOfLength(6))).toBe(2)
    expect(historyWindowSize(idsOfLength(9))).toBe(3)
    expect(historyWindowSize(idsOfLength(12))).toBe(4)
  })

  it('caps at 5 (HISTORY_WINDOW_TARGET) once floor(N/3) would exceed it', () => {
    expect(historyWindowSize(idsOfLength(18))).toBe(5)
    expect(historyWindowSize(idsOfLength(21))).toBe(5)
    expect(historyWindowSize(idsOfLength(100))).toBe(5)
  })

  it('returns 0 below N=3 - no room to spare for an avoidance window', () => {
    expect(historyWindowSize([])).toBe(0)
    expect(historyWindowSize(idsOfLength(1))).toBe(0)
    expect(historyWindowSize(idsOfLength(2))).toBe(0)
  })

  it('matches the live dataset: bagMain -> 5', () => {
    const bagMainIds = variations.map((v) => v.id)
    expect(historyWindowSize(bagMainIds)).toBe(5)
  })
})

describe('pickNext - back-to-back strict-banned picks and the reroll cap', () => {
  const alwaysBanned = [
    { id: 'x', sideshowBanned: true },
    { id: 'y', sideshowBanned: true },
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
    // unconditionally (short-circuits before consuming a Math.random call
    // for the roll). backToBack is true on attempts 1-3 (each rerolled)
    // and attempt 4 is accepted unconditionally.
    //
    // Only one bag exists now, and no starredIds are passed, so there's no
    // bag-selection random() call at all here (unlike the old bagA/bagB
    // choice, which spent a random() call every attempt).
    //
    // Call 1 left bagMain holding 1 leftover id (whichever of x/y wasn't
    // drawn) - call it `leftover`, and `first.variation.id` (== this
    // call's previousId) is the OTHER one, already popped out of bagMain.
    //
    // Hand-traced against pick.js's actual source, call by call, with
    // Math.random pinned at 0.01 throughout:
    //   attempt 1: drawFrom reuses the 1-item `remaining` as-is (it's
    //     `leftover`, which isn't previousId, so no reshuffle and no swap
    //     needed either, top === 0)                             -> 0 calls
    //   attempt 2: bagMain ran dry -> reshuffle (1 call) + same-as-
    //     previous-id swap-check, since the shuffle puts previousId on
    //     top (1 call) - the swap sets previousId aside as bagMain's new
    //     1-item leftover                                        -> 2 calls
    //   attempt 3: bagMain's leftover IS previousId now, so the hardened
    //     reshuffle guard fires again (1 call) + swap-check (1 call)
    //                                                             -> 2 calls
    //   attempt 4: same shape as attempt 3                       -> 2 calls
    //   total                                                    -> 6 calls
    const second = pickNext(alwaysBanned, first.variation.id)

    expect(second.sideshowBannedThisRound).toBe(true)
    expect(spy).toHaveBeenCalledTimes(6)
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
    const mutedIds = variations.slice(0, 6).map((v) => v.id) // well above MIN_UNMUTED for this 32-entry dataset
    const mutedSet = new Set(mutedIds)
    let previousId
    for (let i = 0; i < 1000; i++) {
      const { variation } = pickNext(variations, previousId, { mutedIds })
      expect(mutedSet.has(variation.id)).toBe(false)
      previousId = variation.id
    }
  })

  it('computes bannedRollRate over the unmuted set, not the full dataset', () => {
    // 10 synthetic entries, exactly 5 sideshowBanned: true - the strict
    // share alone (50%) already exceeds the per-draw rate
    // requiredPerDrawRate(TARGET_BANNED_SHARE) needs (~47%, since the
    // reroll's suppression means the raw 33% target itself isn't the
    // per-draw threshold - see requiredPerDrawRate()), so bannedRollRate
    // on the FULL list is 0 (shortfall clamps to 0, no extra roll needed
    // or possible). Muting away those exact 5 strict entries removes the
    // strict share entirely; if the roll rate is correctly recomputed
    // over the remaining 5 (all sideshowBanned: false), it should roll
    // back up to ~33% via the coin flip instead. A bug that kept
    // computing the rate from the full, unfiltered list would see this
    // stay at ~0%.
    const strictIds = ['s1', 's2', 's3', 's4', 's5']
    const synthetic = [
      ...strictIds.map((id) => ({ id, sideshowBanned: true })),
      ...Array.from({ length: 5 }, (_, i) => ({ id: `f${i}`, sideshowBanned: false })),
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
    expect(share).toBeGreaterThan(0.28)
    expect(share).toBeLessThan(0.38)
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
  it('a single starred twist never repeats back-to-back (no starEligible floor anymore)', () => {
    // The old bagStar design needed >= 2 starred ids (an isolated 1-member
    // exclusive bag couldn't ever avoid repeating itself). Starring now
    // just duplicates the id inside the much larger bagMain, so a single
    // starred id has plenty of other ids for drawFrom()'s previousId swap
    // to use - this pins that the guarantee holds uniformly, including at
    // exactly 1 starred id.
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

  it('draws a starred id roughly STARRED_MULTIPLIER (2) times as often as a plain id', () => {
    const starredId = variations[0].id
    const plainId = variations[1].id
    let starredCount = 0
    let plainCount = 0
    let previousId
    const trials = 8000
    for (let i = 0; i < trials; i++) {
      const { variation } = pickNext(variations, previousId, { starredIds: [starredId] })
      if (variation.id === starredId) starredCount++
      if (variation.id === plainId) plainCount++
      previousId = variation.id
    }
    const ratio = starredCount / plainCount
    // STARRED_MULTIPLIER (2) is a private constant, hardcoded here as a
    // literal - same convention as TARGET_BANNED_SHARE elsewhere in this
    // file. Observed ~1.9-2.1 in practice; the tolerance band is wide
    // enough to absorb statistical noise without masking a real
    // regression (e.g. the duplicate slot not being added at all, which
    // would push this ratio down toward 1).
    expect(ratio).toBeGreaterThan(1.6)
    expect(ratio).toBeLessThan(2.4)
  })

  it('starring multiple ids does not dilute each one\'s individual boost', () => {
    // Unlike the old bagStar design - a flat ~30% pre-roll SHARED across
    // however many ids were starred, so each individual starred id's
    // share shrank as more things got starred - duplicating in place
    // gives each starred id its own fixed STARRED_MULTIPLIER slots,
    // independent of how many other ids are also starred.
    const starredIds = variations.slice(0, 2).map((v) => v.id)
    const plainId = variations[2].id
    const counts = new Map()
    let previousId
    const trials = 8000
    for (let i = 0; i < trials; i++) {
      const { variation } = pickNext(variations, previousId, { starredIds })
      counts.set(variation.id, (counts.get(variation.id) ?? 0) + 1)
      previousId = variation.id
    }
    const plainCount = counts.get(plainId) ?? 0
    for (const starredId of starredIds) {
      const ratio = (counts.get(starredId) ?? 0) / plainCount
      expect(ratio).toBeGreaterThan(1.6)
      expect(ratio).toBeLessThan(2.4)
    }
  })
})

describe('pickNext - short-session characterization: starring no longer pathologically concentrates draws', () => {
  // A user reported seeing one twist come up several times in a session
  // while several others never showed at all. That traced back to the old
  // bagStar design's flat ~30% pre-roll, which made starring even 1-2
  // twists swallow up roughly a third of EVERY draw regardless of bag
  // size. STARRED_MULTIPLIER's per-cycle duplication (see pick.js) fixes
  // this: a starred id can appear at most STARRED_MULTIPLIER times before
  // bagMain's own cycle - not just any short session - forces a reshuffle.
  // Pinned here as a session-level regression check.
  const SESSION_DRAWS = 15 // a plausible manual-testing session length
  const SESSIONS = 300
  const starredIds = variations.slice(0, 2).map((v) => v.id)

  function runSession(draws, opts) {
    sessionStorage.clear()
    const counts = new Map()
    let previousId
    for (let i = 0; i < draws; i++) {
      const { variation } = pickNext(variations, previousId, opts)
      counts.set(variation.id, (counts.get(variation.id) ?? 0) + 1)
      previousId = variation.id
    }
    return counts
  }

  it('with no stars, a 15-draw session essentially never repeats any single id 3+ times', () => {
    // bagMain structurally cycles through (nearly) all 32 ids before
    // repeating any (see the "cycles through nearly all members" describe
    // block above) - 15 draws can't exhaust enough of a 32-id bag to loop
    // back around, so a 3x-in-15 repeat should be effectively unseen.
    let sessionsWithTripleRepeat = 0
    for (let s = 0; s < SESSIONS; s++) {
      const counts = runSession(SESSION_DRAWS, {})
      if (Math.max(...counts.values()) >= 3) sessionsWithTripleRepeat++
    }
    expect(sessionsWithTripleRepeat).toBeLessThanOrEqual(1)
  })

  it('starring 2 of 32 ids ALSO essentially never repeats any single id 3+ times in a short session', () => {
    // Each starred id only has 2 copies total in bagMain's source list
    // (STARRED_MULTIPLIER), both consumed within the SAME cycle - so a
    // 15-draw session (well under one full cycle) can show a starred id
    // at most twice, same structural ceiling as the no-star baseline
    // above. Observed 0/500 sessions with a 3x+ repeat, max ever 2, when
    // this was verified against the live implementation.
    let sessionsWithTripleRepeat = 0
    for (let s = 0; s < SESSIONS; s++) {
      const counts = runSession(SESSION_DRAWS, { starredIds })
      if (Math.max(...counts.values()) >= 3) sessionsWithTripleRepeat++
    }
    expect(sessionsWithTripleRepeat).toBeLessThanOrEqual(1)
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
