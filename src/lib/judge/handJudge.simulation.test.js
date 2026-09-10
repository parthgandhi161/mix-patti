import { describe, expect, it } from 'vitest'
import { judgeHandJudge } from './handJudge.js'

function card(rank, suit, joker = false) {
  return { rank, suit, joker }
}

/**
 * Mirrors hand.js's own CATEGORY_RANK (not exported - this is the fixed,
 * public Teen Patti hierarchy, not an internal implementation detail).
 * Used below only to predict the winner from two already-computed
 * category labels, never to reimplement the judge.
 */
const CATEGORY_RANK = { 'high-card': 1, pair: 2, colour: 3, sequence: 4, 'pure-sequence': 5, trail: 6 }

// --- Category ladder: one natural (jokerless) hand per category, all 18
// cards mutually distinct so every pairing below is duplicate-free. -----
const LADDER = [
  { name: 'trail', hand: [card('A', 'S'), card('A', 'H'), card('A', 'D')] },
  { name: 'pure-sequence', hand: [card('K', 'S'), card('Q', 'S'), card('J', 'S')] },
  { name: 'sequence', hand: [card('10', 'D'), card('9', 'C'), card('8', 'H')] },
  { name: 'colour', hand: [card('7', 'C'), card('5', 'C'), card('2', 'C')] },
  { name: 'pair', hand: [card('6', 'D'), card('6', 'H'), card('3', 'S')] },
  { name: 'high-card', hand: [card('K', 'H'), card('9', 'S'), card('4', 'D')] },
]

describe('category hierarchy ladder (every pairing, both modes)', () => {
  for (let i = 0; i < LADDER.length; i++) {
    for (let j = i + 1; j < LADDER.length; j++) {
      const stronger = LADDER[i]
      const weaker = LADDER[j]

      it(`Normal: ${stronger.name} beats ${weaker.name}`, () => {
        const result = judgeHandJudge({ hand1: stronger.hand, hand2: weaker.hand, mode: 'normal' })
        expect(result.winner).toBe(1)
        expect(result.decidedBy).toBe('category')
      })

      it(`Muflis: ${weaker.name} beats ${stronger.name}`, () => {
        const result = judgeHandJudge({ hand1: stronger.hand, hand2: weaker.hand, mode: 'muflis' })
        expect(result.winner).toBe(2)
        expect(result.decidedBy).toBe('category')
      })
    }
  }
})

describe('Muflis + joker-count interaction (documented quirk, not a bug)', () => {
  // Both hands read as Trail of Kings (tied on value) - hand1 needed 2
  // jokers to get there, hand2 only 1. hand.js's D5 tiebreak ("fewer
  // jokers wins") is deliberately never inverted by Muflis - see this
  // repo's src/lib/judge/hand.js compareReadings() comment. Hand Judge
  // is the first feature where Muflis and jokers can combine at all, so
  // this is the first place that non-inversion is actually reachable -
  // pin it down so a future change to either mode's semantics has to
  // touch this test on purpose.
  const hand1 = [card('Q', 'D', true), card('K', 'C'), card('9', 'H')]
  const hand2 = [card('K', 'D'), card('K', 'H'), card('9', 'C', true)]

  it('Normal: hand 2 wins the tie on fewer jokers', () => {
    const result = judgeHandJudge({ hand1, hand2, mode: 'normal' })
    expect(result.winner).toBe(2)
    expect(result.decidedBy).toBe('joker-count')
  })

  it('Muflis: hand 2 STILL wins - the joker-count tiebreak does not flip', () => {
    const result = judgeHandJudge({ hand1, hand2, mode: 'muflis' })
    expect(result.winner).toBe(2)
    expect(result.decidedBy).toBe('joker-count')
  })
})

// --- Seeded randomized simulation -------------------------------------
// Deterministic (fixed seed) so failures reproduce exactly, not a
// flaky/real-random fuzzer. Deals many random 6-card splits (with
// occasional random joker tags and occasional forced duplicate cards, to
// cover the "dealer mis-enters a card" path hasDuplicateCard warns about
// but never blocks), and checks invariants that must hold for ANY input,
// not just the hand-picked cases above.
function mulberry32(seed) {
  let a = seed
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']
const SUITS = ['S', 'H', 'D', 'C']
const VALID_CATEGORIES = new Set(['trail', 'pure-sequence', 'sequence', 'colour', 'pair', 'high-card'])

function fullDeck() {
  const deck = []
  for (const rank of RANKS) for (const suit of SUITS) deck.push({ rank, suit })
  return deck
}

function shuffled(deck, rng) {
  const a = [...deck]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function dealScenario(rng) {
  const dealt = shuffled(fullDeck(), rng).slice(0, 6)
  const hand1 = dealt.slice(0, 3).map((c) => ({ ...c, joker: false }))
  const hand2 = dealt.slice(3, 6).map((c) => ({ ...c, joker: false }))

  const numTags = Math.floor(rng() * 3) // 0, 1 or 2 tagged ranks
  const all = [...hand1, ...hand2]
  for (let t = 0; t < numTags; t++) {
    all[Math.floor(rng() * 6)].joker = true
  }

  // ~15% of deals: force a duplicate card across the two hands, mimicking
  // a real dealer mis-entering the same card twice.
  if (rng() < 0.15) {
    hand2[Math.floor(rng() * 3)] = { ...hand1[Math.floor(rng() * 3)] }
  }

  return { hand1, hand2 }
}

describe('randomized simulation (seeded, deterministic)', () => {
  const rng = mulberry32(20260910)
  const TRIALS = 300

  it(`holds invariants across ${TRIALS} random deals, both modes`, () => {
    for (let trial = 0; trial < TRIALS; trial++) {
      const { hand1, hand2 } = dealScenario(rng)

      for (const mode of ['normal', 'muflis']) {
        const result = judgeHandJudge({ hand1, hand2, mode })

        expect([1, 2, null]).toContain(result.winner)
        expect(['win', 'tie']).toContain(result.outcome)
        expect(result.hands).toHaveLength(2)
        for (const h of result.hands) {
          expect(VALID_CATEGORIES.has(h.reading.category)).toBe(true)
          expect(h.jokersUsed).toBeGreaterThanOrEqual(0)
          expect(h.jokersUsed).toBeLessThanOrEqual(3)
          expect(typeof h.label).toBe('string')
          expect(h.label.length).toBeGreaterThan(0)
        }

        // Category-order consistency: whenever the two final categories
        // differ, the stronger one must have won (or the weaker one, in
        // Muflis) - this is decided purely by category, never by the
        // joker-count/suit tiebreak that follows it.
        const [h1, h2] = result.hands
        if (h1.reading.category !== h2.reading.category) {
          const c1 = CATEGORY_RANK[h1.reading.category]
          const c2 = CATEGORY_RANK[h2.reading.category]
          const strongerHand = c1 > c2 ? 1 : 2
          const expectedWinner = mode === 'muflis' ? (strongerHand === 1 ? 2 : 1) : strongerHand
          expect(result.winner).toBe(expectedWinner)
        }

        // Symmetry: swapping the two hands must swap the winner (or
        // leave a tie a tie) and never change *why* it was decided.
        const swapped = judgeHandJudge({ hand1: hand2, hand2: hand1, mode })
        const expectedSwappedWinner = result.winner === 1 ? 2 : result.winner === 2 ? 1 : null
        expect(swapped.winner).toBe(expectedSwappedWinner)
        expect(swapped.decidedBy).toBe(result.decidedBy)
      }
    }
  })
})
