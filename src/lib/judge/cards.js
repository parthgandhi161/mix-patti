/**
 * Card model, house suit order, and the sequence-order table (D1/D2 in the
 * hand-judge rules). Nothing here reads a real dealt card - a card is
 * always `{ rank, suit }`, introduced fresh for this module since no card
 * representation existed anywhere else in the repo.
 */

export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']

const RANK_VALUE = Object.fromEntries(RANKS.map((r, i) => [r, i + 2]))

export function rankValue(rank) {
  return rank == null ? 0 : RANK_VALUE[rank]
}

// House suit order (D2): deliberately non-standard - Spades > Diamonds > Clubs > Hearts.
export const SUIT_ORDER = ['S', 'D', 'C', 'H']
export const SUIT_ORDER_REVERSED = [...SUIT_ORDER].reverse()

export function suitValue(suit, order = SUIT_ORDER) {
  if (suit == null) return 0
  return order.length - order.indexOf(suit)
}

export function colourOf(suit) {
  return suit === 'D' || suit === 'H' ? 'red' : 'black'
}

// Jodi Bijodi's qualifying sets - face cards are assigned a parity by
// convention (J/K count odd, Q counts even), not by pip value.
export const ODD_RANKS = ['A', '3', '5', '7', '9', 'J', 'K']
export const EVEN_RANKS = ['2', '4', '6', '8', '10', 'Q']

/**
 * Padosi's wild set: the flipped rank plus its neighbours, wrapping at the
 * Ace (a King/Ace/2 flip-neighbourhood, per the variation's own example) -
 * treated as a 13-card cycle rather than a linear 2..A range.
 */
export function neighboursOf(rank) {
  const i = RANKS.indexOf(rank)
  const prev = RANKS[(i - 1 + RANKS.length) % RANKS.length]
  const next = RANKS[(i + 1) % RANKS.length]
  return [prev, rank, next]
}

/**
 * D1: the 12 possible 3-card runs, highest to lowest. A-K-Q tops the
 * table; A-2-3 is inserted right after it as 2nd highest (resolving the
 * "agree whether A-2-3 counts" caveat in muflis.notes - it always counts,
 * ranked 2nd here). Every other run is identified by its own top card.
 */
export const SEQUENCE_ORDER = ['AKQ', 'A23', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4']

/** Which run (if any) 3 distinct ranks form. Returns an id from SEQUENCE_ORDER, or null. */
export function sequenceId(ranks) {
  const set = new Set(ranks)
  if (set.size !== 3) return null
  if (set.has('A') && set.has('2') && set.has('3')) return 'A23'
  if (set.has('A') && set.has('K') && set.has('Q')) return 'AKQ'
  const vals = ranks.map(rankValue).sort((a, b) => a - b)
  if (vals[1] === vals[0] + 1 && vals[2] === vals[1] + 1) {
    return RANKS.find((r) => rankValue(r) === vals[2])
  }
  return null
}

/** Higher return value = better run, per SEQUENCE_ORDER. */
export function sequenceRank(id) {
  return SEQUENCE_ORDER.length - SEQUENCE_ORDER.indexOf(id)
}
