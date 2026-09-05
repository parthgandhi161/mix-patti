/**
 * judgeHands() - the single entry point. Wires a variation's judge
 * config to hand.js/jokers.js/specialModes.js and produces the output
 * contract: { winner, outcome, decidedBy, hands, explanation }.
 */
import { RANKS } from './cards.js'
import { bestThreeOfFour, classify, compareReadings, findBestReading } from './hand.js'
import { resolveWildness } from './jokers.js'
import { applyFilter, closestToTarget, isCursed, removeDeadRank } from './specialModes.js'

const RANK_NAME = { A: 'Ace', K: 'King', Q: 'Queen', J: 'Jack' }

function rankName(rank) {
  return RANK_NAME[rank] ?? rank
}

function rankNamePlural(rank) {
  return `${rankName(rank)}s`
}

function sequenceLabel(seqId) {
  if (seqId === 'AKQ') return 'A-K-Q'
  if (seqId === 'A23') return 'A-2-3'
  const idx = RANKS.indexOf(seqId)
  return [RANKS[idx], RANKS[idx - 1], RANKS[idx - 2]].join('-')
}

function describeCategory(reading) {
  const c = reading.category
  switch (c.type) {
    case 'trail':
      return `Trail of ${rankNamePlural(c.rank)}`
    case 'pure-sequence':
      return `Pure Sequence (${sequenceLabel(c.seqId)})`
    case 'sequence':
      return `Sequence (${sequenceLabel(c.seqId)})`
    case 'colour':
      return `Colour (${c.ranks.join('-')} high)`
    case 'pair':
      return `Pair of ${rankNamePlural(c.pairRank)}`
    case 'high-card':
      return c.cards[0] ? `${rankName(c.cards[0].rank)} High` : 'No cards'
    case 'number':
      return `${c.number}`
    case 'out':
      return 'No qualifying cards'
    default:
      return 'Unknown hand'
  }
}

function buildLabel(reading) {
  const base = describeCategory(reading)
  if (reading.jokersUsed > 0) {
    return `${base} (${reading.jokersUsed} joker${reading.jokersUsed > 1 ? 's' : ''})`
  }
  return base
}

function toReadingShape(reading) {
  if (reading.category.type === 'number') {
    return { category: 'number', number: reading.category.number, target: reading.category.target }
  }
  const cards = reading.assigned ?? reading.naturalCards
  return {
    category: reading.category.type,
    ranks: cards.map((c) => c.rank),
    suits: cards.map((c) => c.suit),
  }
}

function toHandResult(originalCards, reading, disqualified = false) {
  return {
    cards: originalCards,
    reading: toReadingShape(reading),
    jokersUsed: reading.jokersUsed,
    naturalCards: reading.naturalCards,
    label: buildLabel(reading),
    disqualified,
  }
}

const DECIDED_BY_TEXT = {
  category: 'Decided by hand category',
  rank: 'Decided by rank',
  kicker: 'Decided by the kicker card',
  suit: 'Decided by suit',
  'joker-count': 'Both hands tied on value - fewer jokers wins',
  'natural-suit': 'Tied on value and joker count - decided by the natural (non-joker) cards',
  disqualification: 'Decided by disqualification',
  distance: 'Decided by distance to the target',
  'tie-favours-defender': 'Hands tied - ties favour Hand 2',
}

function jokerSuffix(reading) {
  return reading.jokersUsed > 0 ? ` using ${reading.jokersUsed} joker${reading.jokersUsed > 1 ? 's' : ''}` : ''
}

function buildExplanation({ reading1, reading2, winner, decidedBy }) {
  const lines = [
    `Hand 1 reads as ${describeCategory(reading1)}${jokerSuffix(reading1)}`,
    `Hand 2 reads as ${describeCategory(reading2)}${jokerSuffix(reading2)}`,
    DECIDED_BY_TEXT[decidedBy] ?? 'Hands are tied',
    winner ? `Hand ${winner} wins` : 'No winner - result is a tie',
  ]
  return lines
}

function buildReading(cards, judge, extras, side) {
  let liveCards = cards
  if (judge.filter) liveCards = applyFilter(liveCards, extras.filter)
  if (judge.deadRank) liveCards = removeDeadRank(liveCards, extras.deadRank)

  if (judge.sharedCards && extras.sharedCard) {
    const pool = [...liveCards, extras.sharedCard]
    const { cards: subset, classified } = bestThreeOfFour(pool)
    return { category: classified, jokersUsed: 0, naturalCards: subset, assigned: subset }
  }

  if (judge.jokers?.length > 0 && liveCards.length === 3) {
    const wildFlags = resolveWildness(liveCards, judge.jokers, extras, side)
    return findBestReading(liveCards, wildFlags)
  }

  const classified = classify(liveCards)
  return { category: classified, jokersUsed: 0, naturalCards: liveCards, assigned: liveCards }
}

function judgeNumberGame(hand1, hand2, target) {
  const r1 = closestToTarget(hand1, target)
  const r2 = closestToTarget(hand2, target)
  const reading1 = {
    category: { type: 'number', number: r1.number, target },
    jokersUsed: 0,
    naturalCards: hand1,
    assigned: hand1,
  }
  const reading2 = {
    category: { type: 'number', number: r2.number, target },
    jokersUsed: 0,
    naturalCards: hand2,
    assigned: hand2,
  }

  let winner = null
  if (r1.distance < r2.distance) winner = 1
  else if (r2.distance < r1.distance) winner = 2

  return {
    winner,
    outcome: winner === null ? 'tie' : 'win',
    decidedBy: 'distance',
    hands: [toHandResult(hand1, reading1), toHandResult(hand2, reading2)],
    explanation: [
      `Hand 1 forms ${r1.number} (distance ${r1.distance} from ${target})`,
      `Hand 2 forms ${r2.number} (distance ${r2.distance} from ${target})`,
      winner
        ? `Hand ${winner} is closer to ${target}`
        : `Both hands are equally close to ${target} - declared a tie`,
    ],
  }
}

function buildCurseResult(hand1, hand2, cursed1, cursed2) {
  const readingFor = (cards) => ({ category: classify(cards), jokersUsed: 0, naturalCards: cards, assigned: cards })
  const reading1 = readingFor(hand1)
  const reading2 = readingFor(hand2)

  if (cursed1 && cursed2) {
    return {
      winner: null,
      outcome: 'pot-rolls-over',
      decidedBy: 'disqualification',
      hands: [toHandResult(hand1, reading1, true), toHandResult(hand2, reading2, true)],
      explanation: ['Both hands hold a cursed rank', 'Neither hand can win - the pot rolls over'],
    }
  }

  const winner = cursed1 ? 2 : 1
  return {
    winner,
    outcome: 'win',
    decidedBy: 'disqualification',
    hands: [toHandResult(hand1, reading1, cursed1), toHandResult(hand2, reading2, cursed2)],
    explanation: [
      `Hand ${cursed1 ? 1 : 2} holds a cursed rank and is disqualified`,
      `Hand ${winner} wins automatically`,
    ],
  }
}

export function judgeHands({ variation, hand1, hand2, extras = {} }) {
  const judge = variation.judge ?? { ranking: 'standard' }

  if (judge.curse) {
    const cursed1 = isCursed(hand1, extras.curseRanks)
    const cursed2 = isCursed(hand2, extras.curseRanks)
    if (cursed1 || cursed2) return buildCurseResult(hand1, hand2, cursed1, cursed2)
  }

  if (judge.ranking === 'closest-to-999' || judge.ranking === 'closest-to-420') {
    return judgeNumberGame(hand1, hand2, judge.ranking === 'closest-to-999' ? 999 : 420)
  }

  const reading1 = buildReading(hand1, judge, extras, 1)
  const reading2 = buildReading(hand2, judge, extras, 2)

  if (reading1.category.type === 'out' && reading2.category.type === 'out') {
    return {
      winner: null,
      outcome: 'both-disqualified',
      decidedBy: 'disqualification',
      hands: [toHandResult(hand1, reading1), toHandResult(hand2, reading2)],
      explanation: ['Neither hand has any qualifying cards', 'No winner'],
    }
  }

  const invert = judge.ranking === 'muflis'
  const comparison = compareReadings(reading1, reading2, { invert })
  let winner = comparison.result > 0 ? 1 : comparison.result < 0 ? 2 : null
  let decidedBy = comparison.decidedBy

  if (winner === null && judge.tieFavours === 'hand2') {
    winner = 2
    decidedBy = 'tie-favours-defender'
  }

  const outcome = judge.tieFavours ? (winner === 1 ? 'win' : 'pot-rolls-over') : winner === null ? 'tie' : 'win'

  const result = {
    winner,
    outcome,
    decidedBy,
    hands: [toHandResult(hand1, reading1), toHandResult(hand2, reading2)],
    explanation: buildExplanation({ reading1, reading2, winner, decidedBy }),
  }

  if (judge.dualWinner) {
    const worst = compareReadings(reading1, reading2, { invert: true })
    const worstWinner = worst.result > 0 ? 1 : worst.result < 0 ? 2 : null
    result.worstHandResult = {
      winner: worstWinner,
      outcome: worstWinner === null ? 'tie' : 'win',
      decidedBy: worst.decidedBy,
      hands: [toHandResult(hand1, reading1), toHandResult(hand2, reading2)],
      explanation: buildExplanation({ reading1, reading2, winner: worstWinner, decidedBy: worst.decidedBy }),
    }
  }

  return result
}
