import { describe, expect, it } from 'vitest'
import { resolveWildness } from './jokers.js'

function card(rank, suit) {
  return { rank, suit }
}

describe('resolveWildness', () => {
  it('fixedRanks (AK47): marks every matching rank regardless of hand', () => {
    const cards = [card('A', 'S'), card('9', 'D'), card('7', 'C')]
    const wild = resolveWildness(cards, [{ source: 'fixedRanks', ranks: ['A', 'K', '4', '7'] }])
    expect(wild).toEqual([true, false, true])
  })

  it('flippedRankNeighbours wraps at the Ace (Padosi)', () => {
    const cards = [card('K', 'S'), card('A', 'D'), card('2', 'C')]
    const wild = resolveWildness(cards, [{ source: 'flippedRankNeighbours' }], { flippedRank: 'A' })
    expect(wild).toEqual([true, true, true])
  })

  it('personalLowest marks the lowest rank and any duplicate of it (Chhota Joker)', () => {
    const cards = [card('9', 'S'), card('4', 'D'), card('4', 'C')]
    const wild = resolveWildness(cards, [{ source: 'personalLowest' }])
    expect(wild).toEqual([false, true, true])
  })

  it('conditionalPair only fires with a natural pair, wilding just the odd card out (Jodi Joker)', () => {
    const withPair = resolveWildness(
      [card('9', 'S'), card('9', 'D'), card('K', 'C')],
      [{ source: 'conditionalPair' }],
    )
    expect(withPair).toEqual([false, false, true])

    const withoutPair = resolveWildness(
      [card('9', 'S'), card('4', 'D'), card('K', 'C')],
      [{ source: 'conditionalPair' }],
    )
    expect(withoutPair).toEqual([false, false, false])
  })

  it('donatedRank (Joker Lelo Joker): applies the OTHER hand\'s donation, cancels on a same-rank donation', () => {
    const cards1 = [card('Q', 'S'), card('9', 'D'), card('4', 'C')]
    const cards2 = [card('Q', 'H'), card('K', 'D'), card('2', 'C')]

    // Hand 2 donates Q -> wild for hand 1 only.
    const extras = { donatedRank1: '9', donatedRank2: 'Q' }
    expect(resolveWildness(cards1, [{ source: 'donatedRank' }], extras, 1)).toEqual([true, false, false])
    expect(resolveWildness(cards2, [{ source: 'donatedRank' }], extras, 2)).toEqual([false, false, false])

    // Both donate the same rank -> cancels, wild for neither.
    const cancelled = { donatedRank1: 'Q', donatedRank2: 'Q' }
    expect(resolveWildness(cards1, [{ source: 'donatedRank' }], cancelled, 1)).toEqual([false, false, false])
    expect(resolveWildness(cards2, [{ source: 'donatedRank' }], cancelled, 2)).toEqual([false, false, false])
  })

  it('personalSecret only ever applies to hand 1, at the nominated index', () => {
    const cards = [card('9', 'S'), card('4', 'D'), card('K', 'C')]
    const asHand1 = resolveWildness(cards, [{ source: 'personalSecret', scope: 'hand1' }], { personalSecretIndex: 1 }, 1)
    expect(asHand1).toEqual([false, true, false])

    const asHand2 = resolveWildness(cards, [{ source: 'personalSecret', scope: 'hand1' }], { personalSecretIndex: 1 }, 2)
    expect(asHand2).toEqual([false, false, false])
  })

  it('flippedRank (Khula Joker / Badalta Joker): marks whatever rank was flipped', () => {
    const cards = [card('7', 'S'), card('9', 'D'), card('7', 'C')]
    const wild = resolveWildness(cards, [{ source: 'flippedRank' }], { flippedRank: '7' })
    expect(wild).toEqual([true, false, true])
  })

  it('flippedColour (Laal Kaali): marks every card of the flipped colour', () => {
    const cards = [card('9', 'D'), card('4', 'S'), card('K', 'H')]
    const wild = resolveWildness(cards, [{ source: 'flippedColour' }], { flippedColour: 'red' })
    expect(wild).toEqual([true, false, true])
  })

  it('personalCalledRank (Tukka): each hand only sees its own called rank', () => {
    const cards = [card('9', 'S'), card('4', 'D'), card('K', 'C')]
    const extras = { calledRank1: '9', calledRank2: 'K' }
    expect(resolveWildness(cards, [{ source: 'personalCalledRank' }], extras, 1)).toEqual([true, false, false])
    expect(resolveWildness(cards, [{ source: 'personalCalledRank' }], extras, 2)).toEqual([false, false, true])
  })

  it('multiRank (Haath Ka Kachra): marks all 3 drawn ranks for both hands', () => {
    const cards = [card('9', 'S'), card('4', 'D'), card('K', 'C')]
    const wild = resolveWildness(cards, [{ source: 'multiRank', count: 3 }], { multiRanks: ['9', 'K', '2'] })
    expect(wild).toEqual([true, false, true])
  })

  it('tableRank (Boli Wale Joker\'s public joker): marks the bid-called rank for both hands', () => {
    const cards = [card('9', 'S'), card('4', 'D'), card('9', 'C')]
    const wild = resolveWildness(cards, [{ source: 'tableRank' }], { tableRank: '9' })
    expect(wild).toEqual([true, false, true])
  })

  it('tableRank and personalSecret combine for hand 1 (Boli Wale Joker\'s bidder)', () => {
    const cards = [card('9', 'S'), card('4', 'D'), card('K', 'C')]
    const cfg = [{ source: 'tableRank' }, { source: 'personalSecret', scope: 'hand1' }]
    const extras = { tableRank: '9', personalSecretIndex: 2 }
    expect(resolveWildness(cards, cfg, extras, 1)).toEqual([true, false, true])
    expect(resolveWildness(cards, cfg, extras, 2)).toEqual([true, false, false]) // table rank only, no personal secret
  })
})
