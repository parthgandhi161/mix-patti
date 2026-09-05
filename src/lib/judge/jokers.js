/**
 * Resolves which of a hand's dealt cards are wild-eligible, given a
 * variation's judge.jokers config and whatever extra inputs the UI
 * collected. Wildness is a property of the card's ORIGINAL identity only -
 * never of what it might later be assigned to (see hand.js's
 * findBestReading: a wild-eligible card left declared as itself costs 0
 * jokers, it just isn't "used").
 */
import { colourOf, neighboursOf, rankValue } from './cards.js'

export function resolveWildness(cards, jokerConfigs = [], extras = {}, side) {
  const wild = cards.map(() => false)
  const mark = (predicate) => cards.forEach((c, i) => predicate(c) && (wild[i] = true))

  for (const cfg of jokerConfigs) {
    switch (cfg.source) {
      case 'fixedRanks':
        mark((c) => cfg.ranks.includes(c.rank))
        break

      case 'flippedRank':
        mark((c) => c.rank === extras.flippedRank)
        break

      case 'flippedRankNeighbours': {
        const ranks = neighboursOf(extras.flippedRank)
        mark((c) => ranks.includes(c.rank))
        break
      }

      case 'flippedColour':
        mark((c) => colourOf(c.suit) === extras.flippedColour)
        break

      case 'personalLowest': {
        const lowest = Math.min(...cards.map((c) => rankValue(c.rank)))
        mark((c) => rankValue(c.rank) === lowest)
        break
      }

      case 'personalCalledRank': {
        const called = side === 1 ? extras.calledRank1 : extras.calledRank2
        mark((c) => c.rank === called)
        break
      }

      case 'conditionalPair': {
        const counts = {}
        cards.forEach((c) => (counts[c.rank] = (counts[c.rank] || 0) + 1))
        const pairRank = Object.keys(counts).find((r) => counts[r] === 2)
        if (pairRank) {
          const oddIndex = cards.findIndex((c) => c.rank !== pairRank)
          if (oddIndex >= 0) wild[oddIndex] = true
        }
        break
      }

      // Donated by the OTHER hand; cancels out entirely if both hands donate the same rank.
      case 'donatedRank': {
        const incoming = side === 1 ? extras.donatedRank2 : extras.donatedRank1
        const cancels = extras.donatedRank1 != null && extras.donatedRank1 === extras.donatedRank2
        if (incoming != null && !cancels) mark((c) => c.rank === incoming)
        break
      }

      case 'multiRank':
        for (const r of extras.multiRanks || []) mark((c) => c.rank === r)
        break

      case 'tableRank':
        mark((c) => c.rank === extras.tableRank)
        break

      case 'personalSecret':
        if (cfg.scope === 'hand1' && side === 1 && typeof extras.personalSecretIndex === 'number') {
          wild[extras.personalSecretIndex] = true
        }
        break

      default:
        break
    }
  }

  return wild
}
