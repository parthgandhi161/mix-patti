/**
 * Pure UI-facing logic for the Hand Judge screen - kept out of
 * HandJudgeSheet.jsx so it's testable without rendering a component,
 * per this repo's own src/lib convention. Two universal controls, not
 * a 27-variation picker: a Normal/Muflis win-direction switch, and a
 * per-card Joker tag available on any of the 6 dealt cards. The card
 * shape here is the UI's own `{ rank, suit, joker }`, one field richer
 * than judge.js's plain `{ rank, suit }`.
 */
import { judgeHands } from './judge.js'

/**
 * Every rank tagged Joker across both hands, deduped - exactly what
 * jokers.js's existing `multiRank` source (Haath Ka Kachra's own
 * mechanism, reused here for a different purpose) needs to mark every
 * matching card, in either hand, wild.
 */
export function buildMultiRanks(hand1, hand2) {
  const ranks = [...hand1, ...hand2].filter((c) => c?.joker).map((c) => c.rank)
  return [...new Set(ranks)]
}

/**
 * Runs the real judge against a synthesized variation - this UI never
 * picks a named variation, so there's nothing in variations.json to
 * point at. `jokers.js` already had exactly the mechanism this needs
 * (`multiRank`: tag one card, every card of that rank in either hand is
 * wild), so this is the only new "rule" logic Hand Judge required - the
 * engine itself is untouched.
 */
export function judgeHandJudge({ hand1, hand2, mode }) {
  const strip = (c) => ({ rank: c.rank, suit: c.suit })
  const variation = {
    judge: {
      ranking: mode === 'muflis' ? 'muflis' : 'standard',
      jokers: [{ source: 'multiRank' }],
    },
  }
  return judgeHands({
    variation,
    hand1: hand1.map(strip),
    hand2: hand2.map(strip),
    extras: { multiRanks: buildMultiRanks(hand1, hand2) },
  })
}

/**
 * True if the same rank+suit appears more than once across the 6 dealt
 * slots - a warn-not-block signal only, never used to disable Judge:
 * real dealers make real mistakes recording a hand after the fact, and
 * blocking would slow down exactly the mid-game use case this exists
 * for.
 */
export function hasDuplicateCard(hand1, hand2) {
  const seen = new Set()
  for (const c of [...hand1, ...hand2]) {
    if (!c) continue
    const key = `${c.rank}${c.suit}`
    if (seen.has(key)) return true
    seen.add(key)
  }
  return false
}

/**
 * Where the drawer jumps next after filling one slot: scans hand1 then
 * hand2, starting right after the slot that was just filled, so
 * finishing one card always advances toward the next empty one rather
 * than looping back over slots already done. Returns null once both
 * hands are full.
 */
export function nextEmptySlot(handNum, index, hand1, hand2) {
  const flat = [
    [1, 0, hand1[0]],
    [1, 1, hand1[1]],
    [1, 2, hand1[2]],
    [2, 0, hand2[0]],
    [2, 1, hand2[1]],
    [2, 2, hand2[2]],
  ]
  const start = handNum === 1 ? index : 3 + index
  for (let offset = 1; offset <= 6; offset++) {
    const [hn, idx, val] = flat[(start + offset) % 6]
    if (!val) return { hand: hn, index: idx }
  }
  return null
}
