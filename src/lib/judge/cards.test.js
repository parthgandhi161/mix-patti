import { describe, expect, it } from 'vitest'
import { SUIT_ORDER, neighboursOf, rankValue, sequenceId, sequenceRank, suitValue } from './cards.js'

describe('house suit order (D2)', () => {
  it('ranks Spades > Diamonds > Clubs > Hearts', () => {
    expect(suitValue('S')).toBeGreaterThan(suitValue('D'))
    expect(suitValue('D')).toBeGreaterThan(suitValue('C'))
    expect(suitValue('C')).toBeGreaterThan(suitValue('H'))
  })

  it('is exactly one named constant', () => {
    expect(SUIT_ORDER).toEqual(['S', 'D', 'C', 'H'])
  })
})

describe('sequenceId (D1)', () => {
  it('recognises A-2-3 as a valid low run', () => {
    expect(sequenceId(['A', '2', '3'])).toBe('A23')
  })

  it('recognises A-K-Q as the top run', () => {
    expect(sequenceId(['A', 'K', 'Q'])).toBe('AKQ')
  })

  it('ranks A-2-3 as 2nd highest, below A-K-Q but above K-Q-J', () => {
    expect(sequenceRank('AKQ')).toBeGreaterThan(sequenceRank('A23'))
    expect(sequenceRank('A23')).toBeGreaterThan(sequenceRank('K'))
  })

  it('identifies a normal run by its top card', () => {
    expect(sequenceId(['5', '6', '7'])).toBe('7')
    expect(sequenceId(['4', '3', '2'])).toBe('4')
  })

  it('returns null for non-consecutive or duplicate ranks', () => {
    expect(sequenceId(['2', '4', '6'])).toBeNull()
    expect(sequenceId(['5', '5', '6'])).toBeNull()
  })
})

describe('neighboursOf (Padosi, D-item padosi)', () => {
  it('wraps at the Ace: a flipped Ace makes K, A, 2 wild', () => {
    expect(neighboursOf('A')).toEqual(['K', 'A', '2'])
  })

  it('wraps at 2 back to the Ace', () => {
    expect(neighboursOf('2')).toEqual(['A', '2', '3'])
  })

  it('gives the plain neighbourhood for a middle rank', () => {
    expect(neighboursOf('7')).toEqual(['6', '7', '8'])
  })
})

describe('rankValue', () => {
  it('treats a missing rank as below any real card', () => {
    expect(rankValue(null)).toBe(0)
    expect(rankValue('2')).toBeGreaterThan(rankValue(null))
  })
})
