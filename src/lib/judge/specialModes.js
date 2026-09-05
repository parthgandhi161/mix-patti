/**
 * Non-joker special modes: the 999/420 number games, Jodi Bijodi's
 * odd/even filter, Murda Patta's dead rank, and Bhoot Wale Patte's curse
 * check. Muflis, Sabka Hissa's best-3-of-4, and Do Raja's dual result
 * live in hand.js/judge.js instead since they lean directly on the
 * category comparator rather than standing apart from it.
 */
import { EVEN_RANKS, ODD_RANKS } from './cards.js'

// A=1, 2-9/10 face value, J/Q/K=0 (matches the "numbers at face value" text
// in char-sau-bees/999 literally, including 10 - a card's assigned "digit"
// is a coefficient in {0..10}, not a true single decimal digit).
const DIGIT_VALUE = { A: 1, J: 0, Q: 0, K: 0 }

function digitValue(rank) {
  return rank in DIGIT_VALUE ? DIGIT_VALUE[rank] : Number(rank)
}

function permutationsOf3([a, b, c]) {
  return [
    [a, b, c],
    [a, c, b],
    [b, a, c],
    [b, c, a],
    [c, a, b],
    [c, b, a],
  ]
}

/** Best (closest-to-target) 3-digit reading of a hand's cards, tried in every order. */
export function closestToTarget(cards, target) {
  const values = cards.map((c) => digitValue(c.rank))
  let best = null
  for (const [d1, d2, d3] of permutationsOf3(values)) {
    const number = d1 * 100 + d2 * 10 + d3
    const distance = Math.abs(target - number)
    if (!best || distance < best.distance) best = { number, distance }
  }
  return best
}

export function applyFilter(cards, filter) {
  if (!filter) return cards
  const qualifying = filter === 'odd' ? ODD_RANKS : EVEN_RANKS
  return cards.filter((c) => qualifying.includes(c.rank))
}

export function removeDeadRank(cards, deadRank) {
  if (deadRank == null) return cards
  return cards.filter((c) => c.rank !== deadRank)
}

export function isCursed(cards, curseRanks) {
  if (!curseRanks || curseRanks.length === 0) return false
  return cards.some((c) => curseRanks.includes(c.rank))
}
