import { describe, expect, it } from 'vitest'
import { applyFilter, closestToTarget, isCursed, removeDeadRank } from './specialModes.js'

function card(rank, suit) {
  return { rank, suit }
}

describe('closestToTarget (999 / Char Sau Bees)', () => {
  it('arranges cards freely to get as close to the target as possible', () => {
    // Q(0), 9, 9 -> best arrangement toward 999 is 990 (distance 9), not 909 (distance 90).
    const best = closestToTarget([card('Q', 'S'), card('9', 'D'), card('9', 'C')], 999)
    expect(best.number).toBe(990)
    expect(best.distance).toBe(9)
  })

  it('can land over or under the target for Char Sau Bees', () => {
    const best = closestToTarget([card('4', 'S'), card('2', 'D'), card('K', 'C')], 420)
    expect(best.number).toBe(420)
    expect(best.distance).toBe(0)
  })
})

describe('applyFilter (Jodi Bijodi)', () => {
  it('keeps only odd-qualifying cards, including J/K by convention', () => {
    const cards = [card('A', 'S'), card('4', 'D'), card('J', 'C')]
    expect(applyFilter(cards, 'odd')).toEqual([card('A', 'S'), card('J', 'C')])
  })

  it('can leave zero qualifying cards', () => {
    const cards = [card('2', 'S'), card('4', 'D'), card('Q', 'C')]
    expect(applyFilter(cards, 'odd')).toEqual([])
  })
})

describe('removeDeadRank (Murda Patta)', () => {
  it('strips every card of the dead rank, leaving a short hand', () => {
    const cards = [card('K', 'S'), card('K', 'D'), card('9', 'C')]
    expect(removeDeadRank(cards, 'K')).toEqual([card('9', 'C')])
  })
})

describe('isCursed (Bhoot Wale Patte)', () => {
  it('flags a hand holding any cursed rank', () => {
    const cards = [card('A', 'S'), card('9', 'D'), card('4', 'C')]
    expect(isCursed(cards, ['A', 'K'])).toBe(true)
    expect(isCursed(cards, ['K', 'Q'])).toBe(false)
  })
})
