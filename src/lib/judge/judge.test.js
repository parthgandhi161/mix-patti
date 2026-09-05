import { describe, expect, it } from 'vitest'
import { judgeHands } from './judge.js'

function card(rank, suit) {
  return { rank, suit }
}

function variation(judge) {
  return { id: 'test', judge }
}

describe('standard ranking (Teen Patti default)', () => {
  it('the objectively stronger category wins', () => {
    const result = judgeHands({
      variation: variation({ ranking: 'standard' }),
      hand1: [card('2', 'S'), card('2', 'H'), card('2', 'D')], // trail
      hand2: [card('K', 'S'), card('9', 'D'), card('4', 'C')], // high card
    })
    expect(result.winner).toBe(1)
    expect(result.outcome).toBe('win')
    expect(result.decidedBy).toBe('category')
    expect(result.hands[0].label).toBe('Trail of 2s')
  })
})

describe('Padosi (flippedRankNeighbours), Ace wraparound', () => {
  it('a flipped Ace makes K, A, 2 wild - completing a trail of 9s via the wrapped 2', () => {
    const result = judgeHands({
      variation: variation({ jokers: [{ source: 'flippedRankNeighbours' }] }),
      hand1: [card('9', 'S'), card('9', 'D'), card('2', 'C')], // 2 wraps to be wild -> 999, 1 joker
      hand2: [card('Q', 'S'), card('9', 'H'), card('4', 'C')],
      extras: { flippedRank: 'A' },
    })
    expect(result.hands[0].reading.category).toBe('trail')
    expect(result.hands[0].reading.ranks).toEqual(['9', '9', '9'])
    expect(result.hands[0].jokersUsed).toBe(1)
    expect(result.winner).toBe(1)
  })
})

describe('Joker Lelo Joker (donatedRank), same-rank donation', () => {
  it('is wild for the other hand only, not the donor\'s own hand', () => {
    const result = judgeHands({
      variation: variation({ jokers: [{ source: 'donatedRank' }] }),
      // Hand 1 donates 2 (irrelevant to its own hand's wildness); hand 2 donates K
      // (irrelevant to hand 2's own wildness) - each donation only ever helps the OTHER hand.
      hand1: [card('9', 'S'), card('8', 'D'), card('2', 'C')], // has its own donated rank (2) - stays natural
      hand2: [card('K', 'S'), card('K', 'D'), card('2', 'C')], // hand1's donated 2 is wild here -> KKK
      extras: { donatedRank1: '2', donatedRank2: 'K' },
    })
    expect(result.hands[0].reading.category).toBe('high-card')
    expect(result.hands[0].jokersUsed).toBe(0)
    expect(result.hands[1].reading.category).toBe('trail')
    expect(result.hands[1].reading.ranks).toEqual(['K', 'K', 'K'])
    expect(result.hands[1].jokersUsed).toBe(1)
  })

  it('cancels out entirely when both hands donate the same rank', () => {
    const result = judgeHands({
      variation: variation({ jokers: [{ source: 'donatedRank' }] }),
      hand1: [card('Q', 'S'), card('9', 'D'), card('4', 'C')],
      hand2: [card('Q', 'H'), card('K', 'D'), card('2', 'C')],
      extras: { donatedRank1: 'Q', donatedRank2: 'Q' },
    })
    // Q is wild for neither hand - both Qs stay plain natural cards.
    expect(result.hands[0].jokersUsed).toBe(0)
    expect(result.hands[1].jokersUsed).toBe(0)
    expect(result.hands[1].reading.category).toBe('high-card')
  })
})

describe('Jodi Bijodi (filter), zero qualifying cards', () => {
  it('a hand with no qualifying cards is out', () => {
    const result = judgeHands({
      variation: variation({ filter: 'dealer-declares' }),
      hand1: [card('4', 'S'), card('6', 'D'), card('Q', 'C')], // all even
      hand2: [card('3', 'S'), card('5', 'D'), card('K', 'C')], // all odd
      extras: { filter: 'odd' },
    })
    expect(result.hands[0].reading.category).toBe('out')
    expect(result.hands[1].reading.category).not.toBe('out')
    expect(result.winner).toBe(2)
  })

  it('both hands out means no winner', () => {
    const result = judgeHands({
      variation: variation({ filter: 'dealer-declares' }),
      hand1: [card('4', 'S'), card('6', 'D'), card('Q', 'C')],
      hand2: [card('2', 'S'), card('8', 'D'), card('10', 'C')],
      extras: { filter: 'odd' },
    })
    expect(result.winner).toBeNull()
    expect(result.outcome).toBe('both-disqualified')
    expect(result.decidedBy).toBe('disqualification')
  })
})

describe('Murda Patta (deadRank), short hands', () => {
  it('a dead rank removes cards, and the remaining live hand is compared as-is', () => {
    const result = judgeHands({
      variation: variation({ deadRank: 'input' }),
      hand1: [card('K', 'S'), card('K', 'D'), card('9', 'C')], // Kings dead -> just a lone 9
      hand2: [card('Q', 'S'), card('J', 'D'), card('10', 'C')], // untouched sequence
      extras: { deadRank: 'K' },
    })
    expect(result.hands[0].reading.category).toBe('high-card')
    expect(result.hands[1].reading.category).toBe('sequence')
    expect(result.winner).toBe(2)
  })
})

describe('Bhoot Wale Patte (curse)', () => {
  it('both cursed: the pot rolls over, no winner', () => {
    const result = judgeHands({
      variation: variation({ curse: { count: 2 } }),
      hand1: [card('A', 'S'), card('9', 'D'), card('4', 'C')],
      hand2: [card('K', 'S'), card('K', 'D'), card('K', 'C')],
      extras: { curseRanks: ['A', 'K'] },
    })
    expect(result.winner).toBeNull()
    expect(result.outcome).toBe('pot-rolls-over')
    expect(result.decidedBy).toBe('disqualification')
    expect(result.hands[0].disqualified).toBe(true)
    expect(result.hands[1].disqualified).toBe(true)
  })

  it('one cursed: the clean hand wins automatically regardless of strength', () => {
    const result = judgeHands({
      variation: variation({ curse: { count: 2 } }),
      hand1: [card('A', 'S'), card('A', 'D'), card('A', 'C')], // trail of Aces, but cursed
      hand2: [card('9', 'S'), card('6', 'D'), card('2', 'C')], // weak high card, clean
      extras: { curseRanks: ['A', 'K'] },
    })
    expect(result.winner).toBe(2)
    expect(result.outcome).toBe('win')
    expect(result.decidedBy).toBe('disqualification')
  })
})

describe('Beat the B*tch (tieFavours hand2)', () => {
  it('an exact tie favours hand 2 and rolls the pot over', () => {
    const result = judgeHands({
      variation: variation({ tieFavours: 'hand2' }),
      hand1: [card('K', 'S'), card('9', 'D'), card('4', 'C')],
      hand2: [card('K', 'S'), card('9', 'D'), card('4', 'C')], // identical hand - a true tie all the way down
    })
    expect(result.winner).toBe(2)
    expect(result.decidedBy).toBe('tie-favours-defender')
    expect(result.outcome).toBe('pot-rolls-over')
  })

  it('the player still wins outright when genuinely better', () => {
    const result = judgeHands({
      variation: variation({ tieFavours: 'hand2' }),
      hand1: [card('2', 'S'), card('2', 'H'), card('2', 'D')],
      hand2: [card('K', 'S'), card('9', 'D'), card('4', 'C')],
    })
    expect(result.winner).toBe(1)
    expect(result.outcome).toBe('win')
  })
})

describe('Do Raja (dualWinner)', () => {
  it('reports both the best hand and the worst hand', () => {
    const result = judgeHands({
      variation: variation({ dualWinner: true }),
      hand1: [card('K', 'S'), card('K', 'D'), card('K', 'C')], // trail - best standard hand
      hand2: [card('9', 'S'), card('6', 'D'), card('2', 'C')], // high card - worst standard hand
    })
    expect(result.winner).toBe(1)
    expect(result.worstHandResult.winner).toBe(2)
  })
})

describe('Sabka Hissa (sharedCards), best 3 of 4', () => {
  it('picks the best 3-card subset including the shared card', () => {
    const result = judgeHands({
      variation: variation({ sharedCards: 1 }),
      hand1: [card('9', 'S'), card('4', 'D'), card('2', 'C')],
      hand2: [card('K', 'S'), card('Q', 'D'), card('6', 'C')], // + shared J -> drop the 6 for K-Q-J
      extras: { sharedCard: card('J', 'H') },
    })
    expect(result.hands[0].reading.category).toBe('high-card') // best 3-of-4 is still just J-9-4
    expect(result.hands[1].reading.category).toBe('sequence') // K-Q-J beats any high card
    expect(result.hands[1].cards).toHaveLength(3) // original dealt cards reported unchanged
    expect(result.winner).toBe(2)
  })
})

describe('999 / Char Sau Bees exact-distance tie', () => {
  it('declares a tie when both hands are equally close to the target', () => {
    const result = judgeHands({
      variation: variation({ ranking: 'closest-to-420' }),
      hand1: [card('4', 'S'), card('2', 'D'), card('K', 'C')], // 420 exactly
      hand2: [card('4', 'H'), card('2', 'C'), card('Q', 'D')], // 420 exactly
    })
    expect(result.winner).toBeNull()
    expect(result.outcome).toBe('tie')
    expect(result.decidedBy).toBe('distance')
  })
})

describe('Muflis, full end-to-end inversion', () => {
  it('the worst standard hand wins', () => {
    const result = judgeHands({
      variation: variation({ ranking: 'muflis' }),
      hand1: [card('2', 'S'), card('2', 'H'), card('2', 'D')], // trail - worst in Muflis
      hand2: [card('K', 'S'), card('9', 'D'), card('4', 'C')], // high card - best in Muflis
    })
    expect(result.winner).toBe(2)
    expect(result.decidedBy).toBe('category')
  })
})
