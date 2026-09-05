/**
 * Category detection, the D4 optimal joker-assignment search, and the
 * D5/D6 comparator. This is the core of the judge - everything else
 * (jokers.js, specialModes.js) just prepares inputs for the functions
 * here.
 */
import { RANKS, SUIT_ORDER, rankValue, sequenceId, sequenceRank, suitValue } from './cards.js'

const CATEGORY_RANK = {
  out: 0,
  'high-card': 1,
  pair: 2,
  colour: 3,
  sequence: 4,
  'pure-sequence': 5,
  trail: 6,
}

/**
 * Classifies a 1-3 card hand into Layer 1's base category, plus whatever
 * fields Layer 2's tiebreaks need. Fewer than 3 cards only ever happens
 * for Jodi Bijodi (odd/even filter) or Murda Patta (dead rank removed) -
 * neither combines with a joker source, so this is the only place short
 * hands need handling.
 */
export function classify(cards) {
  if (cards.length === 0) return { type: 'out' }
  if (cards.length < 3) return classifyShort(cards)

  const ranks = cards.map((c) => c.rank)
  const suits = cards.map((c) => c.suit)
  const sameRank = ranks[0] === ranks[1] && ranks[1] === ranks[2]
  const sameSuit = suits[0] === suits[1] && suits[1] === suits[2]
  const seqId = sequenceId(ranks)

  if (sameRank) return { type: 'trail', rank: ranks[0] }
  if (seqId && sameSuit) return { type: 'pure-sequence', seqId, suit: suits[0] }
  if (seqId) return { type: 'sequence', seqId }
  if (sameSuit) {
    const sorted = [...ranks].sort((a, b) => rankValue(b) - rankValue(a))
    return { type: 'colour', ranks: sorted, suit: suits[0] }
  }

  const counts = {}
  ranks.forEach((r) => (counts[r] = (counts[r] || 0) + 1))
  const pairRank = Object.keys(counts).find((r) => counts[r] === 2)
  if (pairRank) {
    const kickerRank = ranks.find((r) => r !== pairRank)
    const pairSuits = suits.filter((_, i) => ranks[i] === pairRank)
    return { type: 'pair', pairRank, kickerRank, pairSuits }
  }

  const sorted = [...cards].sort((a, b) => rankValue(b.rank) - rankValue(a.rank))
  return { type: 'high-card', cards: sorted }
}

function classifyShort(cards) {
  if (cards.length === 2) {
    if (cards[0].rank === cards[1].rank) {
      return { type: 'pair', pairRank: cards[0].rank, kickerRank: null, pairSuits: cards.map((c) => c.suit) }
    }
    const sorted = [...cards].sort((a, b) => rankValue(b.rank) - rankValue(a.rank))
    return { type: 'high-card', cards: sorted }
  }
  return { type: 'high-card', cards: [...cards] } // length === 1
}

/**
 * Ordered Layer-2 tiebreak steps for a classified hand. "Sequence" has no
 * suit step here on purpose - see compareReadings' own comment for why
 * that's not a gap.
 */
function layer2Steps(c, suitOrder) {
  const suitOf = (s) => suitValue(s, suitOrder)
  switch (c.type) {
    case 'trail':
      return [{ key: 'rank', value: rankValue(c.rank) }]
    case 'pure-sequence':
      return [
        { key: 'rank', value: sequenceRank(c.seqId) },
        { key: 'suit', value: suitOf(c.suit) },
      ]
    case 'sequence':
      return [{ key: 'rank', value: sequenceRank(c.seqId) }]
    case 'colour':
      return [...c.ranks.map((r) => ({ key: 'rank', value: rankValue(r) })), { key: 'suit', value: suitOf(c.suit) }]
    case 'pair':
      return [
        { key: 'rank', value: rankValue(c.pairRank) },
        { key: 'kicker', value: rankValue(c.kickerRank) },
        { key: 'suit', value: Math.max(...c.pairSuits.map(suitOf)) },
      ]
    case 'high-card': {
      const padded = [...c.cards]
      while (padded.length < 3) padded.push(null)
      return [
        ...padded.map((card) => ({ key: 'rank', value: card ? rankValue(card.rank) : 0 })),
        ...padded.map((card) => ({ key: 'suit', value: card ? suitOf(card.suit) : 0 })),
      ]
    }
    default:
      return []
  }
}

/** Absolute score for a classified hand - used for D4's own per-hand optimum search, standard order always. */
function standardScore(classified) {
  return [CATEGORY_RANK[classified.type] ?? 0, ...layer2Steps(classified, SUIT_ORDER).map((s) => s.value)]
}

function compareScores(a, b) {
  const len = Math.max(a.length, b.length)
  for (let i = 0; i < len; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

function isSameCard(a, b) {
  return a.rank === b.rank && a.suit === b.suit
}

/**
 * D4: for a 3-card hand with some cards wild-eligible, search every
 * possible (rank, suit) assignment for the wild slots and keep the one
 * that maximises, lexicographically: hand value, then fewest jokers
 * used. A wild-eligible card left declared as its own real identity
 * costs 0 jokers - see the D5 AAA-ladder example this mirrors.
 *
 * At most 3 slots are ever free (a hand only has 3 cards), so the search
 * space is bounded at 52^3 - trivial for a judge invoked occasionally,
 * not a hot path.
 */
export function findBestReading(cards, wildFlags) {
  const wildIdx = wildFlags.map((w, i) => (w ? i : -1)).filter((i) => i >= 0)

  function optionsFor(i) {
    if (!wildFlags[i]) return [cards[i]]
    const out = []
    for (const rank of RANKS) for (const suit of SUIT_ORDER) out.push({ rank, suit })
    return out
  }

  let best = null
  for (const a of optionsFor(0)) {
    for (const b of optionsFor(1)) {
      for (const c of optionsFor(2)) {
        const assigned = [a, b, c]
        const classified = classify(assigned)
        const score = standardScore(classified)
        const jokersUsed = wildIdx.filter((i) => !isSameCard(assigned[i], cards[i])).length
        const suitPref = assigned.map((x) => suitValue(x.suit)).sort((p, q) => q - p)

        if (best) {
          const scoreCmp = compareScores(score, best.score)
          const better =
            scoreCmp > 0 ||
            (scoreCmp === 0 &&
              (jokersUsed < best.jokersUsed ||
                (jokersUsed === best.jokersUsed && lexGreater(suitPref, best.suitPref))))
          if (!better) continue
        }
        best = { assigned, classified, score, jokersUsed, suitPref }
      }
    }
  }

  const naturalCards = best.assigned.filter((c, i) => isSameCard(c, cards[i]))
  return { category: best.classified, jokersUsed: best.jokersUsed, naturalCards, assigned: best.assigned }
}

function lexGreater(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] > b[i]
  }
  return false
}

/** Picks the best 3-of-4 subset (Sabka Hissa's shared card) by standard value alone - no jokers ever combine with it. */
export function bestThreeOfFour(cards) {
  let best = null
  for (let drop = 0; drop < cards.length; drop++) {
    const subset = cards.filter((_, i) => i !== drop)
    const classified = classify(subset)
    const score = standardScore(classified)
    if (!best || compareScores(score, best.score) > 0) best = { subset, classified, score }
  }
  return { cards: best.subset, classified: best.classified }
}

function naturalPositions(naturalCards, suitOrder) {
  const sorted = [...naturalCards].sort((a, b) => rankValue(b.rank) - rankValue(a.rank))
  const padded = [...sorted]
  while (padded.length < 3) padded.push(null)
  return {
    ranks: padded.map((c) => (c ? rankValue(c.rank) : 0)),
    suits: padded.map((c) => (c ? suitValue(c.suit, suitOrder) : 0)),
  }
}

/**
 * Compares two already-optimal readings: category (D1) -> Layer 2
 * tiebreaks -> D5 (fewer jokers) -> D6 (natural cards, rank first, then
 * suit - jokers excluded). `invert` is Muflis: it flips category order,
 * every rank comparison, AND the suit ladder (per the task's "invert the
 * entire comparison" instruction) - D5 is deliberately never inverted,
 * since no Muflis variation combines with a joker source.
 *
 * D6 running unconditionally (even for two fully-natural, 0-joker hands)
 * is what backfills "Sequence"'s missing Layer-2 suit column - Layer 2's
 * own suit steps compare the DECLARED (possibly joker-assigned) suit;
 * D6 afterward re-checks using natural-only cards.
 */
export function compareReadings(readingA, readingB, { invert = false } = {}) {
  const dir = invert ? -1 : 1
  // Muflis inverts suits by reordering the ladder itself (Hearts > ... > Spades),
  // not by flipping the sign of a suit comparison - flipping both would cancel out.
  const suitOrder = invert ? [...SUIT_ORDER].reverse() : SUIT_ORDER

  const catA = CATEGORY_RANK[readingA.category.type] ?? 0
  const catB = CATEGORY_RANK[readingB.category.type] ?? 0
  if (catA !== catB) {
    return { result: dir * Math.sign(catA - catB), decidedBy: 'category' }
  }

  const stepsA = layer2Steps(readingA.category, suitOrder)
  const stepsB = layer2Steps(readingB.category, suitOrder)
  for (let i = 0; i < Math.max(stepsA.length, stepsB.length); i++) {
    const a = stepsA[i]?.value ?? 0
    const b = stepsB[i]?.value ?? 0
    if (a !== b) {
      const key = stepsA[i]?.key ?? stepsB[i]?.key ?? 'rank'
      const sign = key === 'suit' ? Math.sign(a - b) : dir * Math.sign(a - b)
      return { result: sign, decidedBy: key }
    }
  }

  if (readingA.jokersUsed !== readingB.jokersUsed) {
    return { result: readingA.jokersUsed < readingB.jokersUsed ? 1 : -1, decidedBy: 'joker-count' }
  }

  const natA = naturalPositions(readingA.naturalCards, suitOrder)
  const natB = naturalPositions(readingB.naturalCards, suitOrder)
  for (let i = 0; i < 3; i++) {
    if (natA.ranks[i] !== natB.ranks[i]) {
      return { result: dir * Math.sign(natA.ranks[i] - natB.ranks[i]), decidedBy: 'natural-suit' }
    }
  }
  for (let i = 0; i < 3; i++) {
    if (natA.suits[i] !== natB.suits[i]) {
      return { result: Math.sign(natA.suits[i] - natB.suits[i]), decidedBy: 'natural-suit' }
    }
  }

  return { result: 0, decidedBy: null }
}
