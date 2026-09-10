import { describe, expect, it } from 'vitest'
import { summarise, summariseBadges } from './summary.js'

function makeVariation(overrides = {}) {
  return {
    cardsPerPlayer: 3,
    tableCards: 0,
    joker: null,
    winner: 'Best standard hand wins',
    ...overrides,
  }
}

describe('summariseBadges - deal label', () => {
  it('says "N cards each" for a normal per-player deal', () => {
    const [deal] = summariseBadges(makeVariation({ cardsPerPlayer: 3 }))
    expect(deal.label).toBe('3 cards each')
  })

  it('singularises to "1 card each"', () => {
    const [deal] = summariseBadges(makeVariation({ cardsPerPlayer: 1 }))
    expect(deal.label).toBe('1 card each')
  })

  it('says "no hand" when nobody is dealt a hand and there are no table cards', () => {
    const [deal] = summariseBadges(makeVariation({ cardsPerPlayer: 0 }))
    expect(deal.label).toBe('no hand')
  })

  it('switches to the terse "N each · M table" form once table cards exist', () => {
    const [deal] = summariseBadges(makeVariation({ cardsPerPlayer: 3, tableCards: 5 }))
    expect(deal.label).toBe('3 each · 5 table')
  })

  it('says "none" (not "0 each") when table cards exist but no per-player hand does', () => {
    const [deal] = summariseBadges(makeVariation({ cardsPerPlayer: 0, tableCards: 5 }))
    expect(deal.label).toBe('none · 5 table')
  })
})

describe('summariseBadges - win label', () => {
  it('defaults to "Best hand wins"', () => {
    const [, win] = summariseBadges(makeVariation({ winner: 'Best standard hand wins' }))
    expect(win.label).toBe('Best hand wins')
  })

  it.each([
    ['worst', 'Worst hand wins'],
    ['both win', 'Both win if hands are equal'],
    ['closest', 'Closest to the target wins'],
    ['between', 'A hand between two others wins'],
    ['highest single', 'Highest single card wins'],
  ])('flips to "Win flips" when the winner text mentions %s', (_case, winnerText) => {
    const [, win] = summariseBadges(makeVariation({ winner: winnerText }))
    expect(win.label).toBe('Win flips')
  })

  it('the WIN_FLIPS match is case-insensitive', () => {
    const [, win] = summariseBadges(makeVariation({ winner: 'The WORST hand at the table wins' }))
    expect(win.label).toBe('Win flips')
  })
})

describe('summariseBadges - twist (joker) badge', () => {
  it('omits the twist badge when joker is null', () => {
    const badges = summariseBadges(makeVariation({ joker: null }))
    expect(badges.map((b) => b.key)).not.toContain('twist')
    expect(badges).toHaveLength(2)
  })

  it('adds a "★ Joker" badge when a joker rule is present', () => {
    const badges = summariseBadges(makeVariation({ joker: 'Flip a card to set the joker rank' }))
    expect(badges).toHaveLength(3)
    expect(badges[2]).toEqual({ key: 'twist', label: '★ Joker', tone: 'gold' })
  })
})

describe('summarise', () => {
  it('joins badge labels with " · "', () => {
    const variation = makeVariation({ cardsPerPlayer: 3, joker: 'Twos are wild' })
    expect(summarise(variation)).toBe('3 cards each · Best hand wins · ★ Joker')
  })

  it('appends the sideshow-banned suffix only when flagged this round', () => {
    const variation = makeVariation()
    expect(summarise(variation, { sideshowBannedThisRound: true })).toBe(
      '3 cards each · Best hand wins · Sideshow banned this round',
    )
    expect(summarise(variation, { sideshowBannedThisRound: false })).toBe(
      '3 cards each · Best hand wins',
    )
    expect(summarise(variation)).toBe('3 cards each · Best hand wins')
  })
})
