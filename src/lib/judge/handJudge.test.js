import { describe, expect, it } from 'vitest'
import { buildMultiRanks, hasDuplicateCard, judgeHandJudge, nextEmptySlot } from './handJudge.js'

function card(rank, suit, joker = false) {
  return { rank, suit, joker }
}

describe('judgeHandJudge - no joker tagged', () => {
  it('plain Normal comparison: the stronger category wins, no jokers used', () => {
    const result = judgeHandJudge({
      hand1: [card('2', 'S'), card('2', 'H'), card('2', 'D')], // trail
      hand2: [card('K', 'S'), card('9', 'D'), card('4', 'C')], // high card
      mode: 'normal',
    })
    expect(result.winner).toBe(1)
    expect(result.hands[0].label).toBe('Trail of 2s')
    expect(result.hands[0].jokersUsed).toBe(0)
    expect(result.hands[1].jokersUsed).toBe(0)
  })

  it('Muflis inverts the same two hands: the weaker category wins instead', () => {
    const result = judgeHandJudge({
      hand1: [card('2', 'S'), card('2', 'H'), card('2', 'D')], // trail
      hand2: [card('K', 'S'), card('9', 'D'), card('4', 'C')], // high card
      mode: 'muflis',
    })
    expect(result.winner).toBe(2)
  })

  it('a tie returns no winner', () => {
    // Identical hands - genuinely indistinguishable, not just same
    // ranks (suit is always a tiebreak here, house order per cards.js,
    // so two hands with the same ranks in different suits are not
    // actually a tie).
    const result = judgeHandJudge({
      hand1: [card('A', 'S'), card('K', 'D'), card('4', 'C')],
      hand2: [card('A', 'S'), card('K', 'D'), card('4', 'C')],
      mode: 'normal',
    })
    expect(result.winner).toBeNull()
    expect(result.outcome).toBe('tie')
  })
})

describe('judgeHandJudge - joker tag picks the best possible hand', () => {
  it('completes the best possible pair rather than leaving the joker as its own natural rank', () => {
    // 2-S, K-H, 7-S(joker): the joker could match either fixed card,
    // but pairing the King beats pairing the 2 - and both beat leaving
    // it as a natural 7 (still just high-card, no pair at all).
    const result = judgeHandJudge({
      hand1: [card('2', 'S'), card('K', 'H'), card('7', 'S', true)],
      hand2: [card('9', 'S'), card('6', 'D'), card('3', 'C')],
      mode: 'normal',
    })
    const [h1] = result.hands
    expect(h1.reading.category).toBe('pair')
    expect(h1.reading.ranks).toContain('K')
    expect(h1.jokersUsed).toBe(1)
    expect(h1.label).toBe('Pair of Kings (1 joker)')
  })

  it('reaches for a trail over a lesser pair when the joker can complete one', () => {
    // K-S, K-D, 9-C(joker): completing the pair into a trail of Kings
    // beats every other assignment the joker could make.
    const result = judgeHandJudge({
      hand1: [card('K', 'S'), card('K', 'D'), card('9', 'C', true)],
      hand2: [card('A', 'S'), card('K', 'C'), card('Q', 'D')],
      mode: 'normal',
    })
    const [h1] = result.hands
    expect(h1.reading.category).toBe('trail')
    expect(h1.reading.ranks).toEqual(['K', 'K', 'K'])
    expect(h1.jokersUsed).toBe(1)
    expect(result.winner).toBe(1)
  })

  it('a tagged rank is wild everywhere it appears, in either hand', () => {
    // Only hand 1's 7 is tagged, but multiRank makes every 7 wild in
    // BOTH hands - hand 2's own 7 becomes its joker too, with no tag of
    // its own needed.
    const result = judgeHandJudge({
      hand1: [card('A', 'S'), card('K', 'H'), card('7', 'S', true)],
      hand2: [card('9', 'S'), card('9', 'D'), card('7', 'C')],
      mode: 'normal',
    })
    const [, h2] = result.hands
    expect(h2.reading.category).toBe('trail')
    expect(h2.reading.ranks).toEqual(['9', '9', '9'])
    expect(h2.jokersUsed).toBe(1)
  })

  it('a card whose rank was never tagged is never wild, no matter how much better the hand would be if it were', () => {
    // Only '7' is in multiRanks - K-H and 2-D can't be reassigned even
    // though turning the 2 into a third King would make a trail.
    const result = judgeHandJudge({
      hand1: [card('7', 'S', true), card('K', 'H'), card('2', 'D')],
      hand2: [card('9', 'S'), card('6', 'D'), card('3', 'C')],
      mode: 'normal',
    })
    const [h1] = result.hands
    expect(h1.jokersUsed).toBe(1)
    expect(h1.reading.category).toBe('pair')
    expect(h1.reading.ranks).toContain('K')
  })

  it('works the same way for hand 2, symmetrically', () => {
    const result = judgeHandJudge({
      hand1: [card('9', 'S'), card('6', 'D'), card('3', 'C')],
      hand2: [card('Q', 'S'), card('Q', 'H'), card('4', 'D', true)],
      mode: 'normal',
    })
    const [, h2] = result.hands
    expect(h2.reading.category).toBe('trail')
    expect(h2.reading.ranks).toEqual(['Q', 'Q', 'Q'])
    expect(h2.jokersUsed).toBe(1)
    expect(result.winner).toBe(2)
  })
})

describe('buildMultiRanks', () => {
  it('collects only tagged ranks, deduped, across both hands', () => {
    const hand1 = [card('7', 'S', true), card('K', 'H'), null]
    const hand2 = [card('7', 'D', true), card('9', 'C', true), null]
    expect(buildMultiRanks(hand1, hand2)).toEqual(['7', '9'])
  })

  it('is empty when nothing is tagged', () => {
    const hand1 = [card('7', 'S'), card('K', 'H'), card('2', 'C')]
    const hand2 = [null, null, null]
    expect(buildMultiRanks(hand1, hand2)).toEqual([])
  })
})

describe('hasDuplicateCard', () => {
  it('is true when the same rank+suit appears twice across both hands', () => {
    const hand1 = [card('A', 'S'), card('K', 'H'), card('7', 'S')]
    const hand2 = [card('A', 'S'), null, null]
    expect(hasDuplicateCard(hand1, hand2)).toBe(true)
  })

  it('is false when all filled slots are distinct, ignoring empty ones', () => {
    const hand1 = [card('A', 'S'), card('K', 'H'), null]
    const hand2 = [card('A', 'H'), null, null]
    expect(hasDuplicateCard(hand1, hand2)).toBe(false)
  })
})

describe('nextEmptySlot', () => {
  it('advances to the next slot in the same hand first', () => {
    const hand1 = [card('A', 'S'), null, null]
    const hand2 = [null, null, null]
    expect(nextEmptySlot(1, 0, hand1, hand2)).toEqual({ hand: 1, index: 1 })
  })

  it('wraps from the end of hand1 into the start of hand2', () => {
    const hand1 = [card('A', 'S'), card('K', 'H'), card('Q', 'D')]
    const hand2 = [null, null, null]
    expect(nextEmptySlot(1, 2, hand1, hand2)).toEqual({ hand: 2, index: 0 })
  })

  it('skips slots that are already filled', () => {
    const hand1 = [card('A', 'S'), card('K', 'H'), null]
    const hand2 = [card('2', 'S'), null, card('4', 'C')]
    // just filled hand1[1] -> next empty going forward is hand1[2], not hand2[0]
    expect(nextEmptySlot(1, 1, hand1, hand2)).toEqual({ hand: 1, index: 2 })
  })

  it('returns null once every slot is filled', () => {
    const hand1 = [card('A', 'S'), card('K', 'H'), card('Q', 'D')]
    const hand2 = [card('2', 'S'), card('3', 'D'), card('4', 'C')]
    expect(nextEmptySlot(2, 2, hand1, hand2)).toBeNull()
  })
})
