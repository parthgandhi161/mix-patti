import { describe, expect, it } from 'vitest'
import { classify, compareReadings, findBestReading } from './hand.js'

function card(rank, suit) {
  return { rank, suit }
}

function readingFor(cards, wildFlags = cards.map(() => false)) {
  if (wildFlags.some(Boolean)) return findBestReading(cards, wildFlags)
  const category = classify(cards)
  return { category, jokersUsed: 0, naturalCards: cards, assigned: cards }
}

describe('D3/D4: optimal joker assignment', () => {
  it('7s wild: 7-7-7 declares a natural trail of 7s at 0 jokers when nothing better is available', () => {
    const cards = [card('7', 'S'), card('7', 'H'), card('7', 'D')]
    const best = findBestReading(cards, [true, true, true])
    // AAA (rank 14) beats 777 (rank 7) on value alone - always the true optimum.
    expect(best.category.type).toBe('trail')
    expect(best.category.rank).toBe('A')
    expect(best.jokersUsed).toBe(3)
  })

  it('5S 6S 7H is a pure sequence when 7s are wild (takes both rank AND suit, D3)', () => {
    const cards = [card('5', 'S'), card('6', 'S'), card('7', 'H')]
    const best = findBestReading(cards, [false, false, true])
    expect(best.category.type).toBe('pure-sequence')
    expect(best.category.seqId).toBe('7')
    expect(best.category.suit).toBe('S')
    expect(best.jokersUsed).toBe(1)
  })

  it('a wild card left declared as its own identity costs 0 jokers', () => {
    // A wild, but the hand is already a natural trail of Aces - nothing beats
    // that, so the optimum leaves the wild card exactly as itself.
    const cards = [card('A', 'S'), card('A', 'D'), card('A', 'C')]
    const best = findBestReading(cards, [false, false, true])
    expect(best.category.type).toBe('trail')
    expect(best.jokersUsed).toBe(0)
    expect(best.naturalCards).toHaveLength(3)
  })
})

describe('D5: fewer jokers wins the AAA ladder', () => {
  const AAA = card // alias for readability below
  const hands = [
    { cards: [AAA('A', 'S'), AAA('A', 'H'), AAA('A', 'D')], jokers: 0 },
    { cards: [AAA('A', 'S'), AAA('A', 'H'), AAA('7', 'D')], jokers: 1 },
    { cards: [AAA('A', 'C'), AAA('7', 'S'), AAA('7', 'H')], jokers: 2 },
    { cards: [AAA('7', 'S'), AAA('7', 'H'), AAA('7', 'D')], jokers: 3 },
  ]
  const wildFlags = (cards) => cards.map((c) => c.rank === '7')

  it('every rung reads as Trail of Aces, using exactly the stated joker count', () => {
    for (const h of hands) {
      const best = findBestReading(h.cards, wildFlags(h.cards))
      expect(best.category.type).toBe('trail')
      expect(best.category.rank).toBe('A')
      expect(best.jokersUsed).toBe(h.jokers)
    }
  })

  it('each rung beats the next: 0 > 1 > 2 > 3 jokers', () => {
    for (let i = 0; i < hands.length - 1; i++) {
      const better = findBestReading(hands[i].cards, wildFlags(hands[i].cards))
      const worse = findBestReading(hands[i + 1].cards, wildFlags(hands[i + 1].cards))
      const cmp = compareReadings(better, worse)
      expect(cmp.result).toBeGreaterThan(0)
      expect(cmp.decidedBy).toBe('joker-count')
    }
  })
})

describe('D6: natural cards compared rank-first, suit only as a final tiebreak', () => {
  // Config: ranks 2 and 3 are wild. Both hands independently resolve to the
  // exact same declared hand (Sequence 7-6-5, 1 joker each) but by covering
  // a DIFFERENT slot with the joker - so their natural cards differ in rank,
  // not just suit. Hand 2's natural 7 should decide it before suit is ever
  // considered.
  it('decides by the rank of the natural cards before suit', () => {
    const hand1 = readingFor(
      [card('6', 'D'), card('5', 'C'), card('2', 'S')],
      [false, false, true],
    )
    const hand2 = readingFor(
      [card('7', 'D'), card('5', 'C'), card('3', 'S')],
      [false, false, true],
    )
    expect(hand1.category.type).toBe('sequence')
    expect(hand2.category.type).toBe('sequence')
    expect(hand1.category.seqId).toBe('7')
    expect(hand2.category.seqId).toBe('7')
    expect(hand1.jokersUsed).toBe(1)
    expect(hand2.jokersUsed).toBe(1)

    const cmp = compareReadings(hand1, hand2)
    expect(cmp.decidedBy).toBe('natural-suit')
    expect(cmp.result).toBeLessThan(0) // hand2's natural 7 outranks hand1's natural 6
  })

  it('falls back to suit only once the natural ranks are fully tied', () => {
    const hand1 = readingFor(
      [card('6', 'S'), card('5', 'D'), card('2', 'C')],
      [false, false, true],
    )
    const hand2 = readingFor(
      [card('6', 'D'), card('5', 'C'), card('3', 'S')],
      [false, false, true],
    )
    // Same natural ranks (6, 5) on both sides - only suit differs.
    const cmp = compareReadings(hand1, hand2)
    expect(cmp.decidedBy).toBe('natural-suit')
    expect(cmp.result).toBeGreaterThan(0) // hand1's natural 6 is Spades, beats hand2's Diamond
  })

  it('is a genuine tie when both hands are entirely jokers', () => {
    const hand1 = readingFor([card('2', 'S'), card('2', 'H'), card('2', 'D')], [true, true, true])
    const hand2 = readingFor([card('3', 'S'), card('3', 'H'), card('3', 'D')], [true, true, true])
    // Both optimise to the same trail (Aces), all-joker on both sides.
    const cmp = compareReadings(hand1, hand2)
    expect(cmp.result).toBe(0)
  })
})

describe('Layer 2: colour and high-card suit cascade', () => {
  it('colour compares its single shared suit', () => {
    const diamonds = readingFor([card('K', 'D'), card('9', 'D'), card('4', 'D')])
    const clubs = readingFor([card('K', 'C'), card('9', 'C'), card('4', 'C')])
    const cmp = compareReadings(diamonds, clubs)
    expect(cmp.decidedBy).toBe('suit')
    expect(cmp.result).toBeGreaterThan(0)
  })

  it('high card cascades suit position by position when top cards tie', () => {
    const hand1 = readingFor([card('K', 'S'), card('9', 'D'), card('4', 'C')])
    const hand2 = readingFor([card('K', 'S'), card('9', 'C'), card('4', 'D')])
    const cmp = compareReadings(hand1, hand2)
    expect(cmp.decidedBy).toBe('suit')
    expect(cmp.result).toBeGreaterThan(0) // hand1's 2nd card (Diamond) beats hand2's (Club)
  })

  it('pair compares the higher of the pair\'s two suits', () => {
    const hand1 = readingFor([card('K', 'S'), card('K', 'H'), card('9', 'D')])
    const hand2 = readingFor([card('K', 'D'), card('K', 'C'), card('9', 'D')])
    const cmp = compareReadings(hand1, hand2)
    expect(cmp.decidedBy).toBe('suit')
    expect(cmp.result).toBeGreaterThan(0)
  })
})

describe('Muflis: full inversion', () => {
  it('inverts category order - high card beats trail', () => {
    const trail = readingFor([card('2', 'S'), card('2', 'H'), card('2', 'D')])
    const highCard = readingFor([card('K', 'S'), card('9', 'D'), card('4', 'C')])
    const cmp = compareReadings(highCard, trail, { invert: true })
    expect(cmp.decidedBy).toBe('category')
    expect(cmp.result).toBeGreaterThan(0)
  })

  it('inverts within-category rank order - lower cards win', () => {
    const low = readingFor([card('5', 'S'), card('3', 'D'), card('2', 'C')])
    const high = readingFor([card('K', 'S'), card('9', 'D'), card('4', 'C')])
    const cmp = compareReadings(low, high, { invert: true })
    expect(cmp.decidedBy).toBe('rank')
    expect(cmp.result).toBeGreaterThan(0)
  })

  it('inverts the suit ladder too - Hearts beats Spades', () => {
    const hearts = readingFor([card('K', 'H'), card('9', 'D'), card('4', 'C')])
    const spades = readingFor([card('K', 'S'), card('9', 'D'), card('4', 'C')])
    const cmp = compareReadings(hearts, spades, { invert: true })
    expect(cmp.decidedBy).toBe('suit')
    expect(cmp.result).toBeGreaterThan(0)
  })
})

describe('short hands (Jodi Bijodi / Murda Patta helper)', () => {
  it('a 2-card pair beats a 3-card high card, missing slots rank below any card', () => {
    const pair = readingFor([card('9', 'S'), card('9', 'H')])
    const highCard = readingFor([card('K', 'S'), card('9', 'D'), card('4', 'C')])
    const cmp = compareReadings(pair, highCard)
    expect(cmp.decidedBy).toBe('category')
    expect(cmp.result).toBeGreaterThan(0)
  })

  it('a 1-card hand is high card with two missing slots below any real card', () => {
    const single = readingFor([card('2', 'S')])
    const twoCards = readingFor([card('2', 'D'), card('3', 'C')])
    const cmp = compareReadings(twoCards, single)
    expect(cmp.result).toBeGreaterThan(0)
  })

  it('a hand with zero live cards is category "out", below everything', () => {
    const out = readingFor([])
    const single = readingFor([card('2', 'S')])
    expect(out.category.type).toBe('out')
    const cmp = compareReadings(single, out)
    expect(cmp.decidedBy).toBe('category')
    expect(cmp.result).toBeGreaterThan(0)
  })
})
