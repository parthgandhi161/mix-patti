/**
 * The quiet summary under the variation name (Stage 3), broken into up
 * to three badges: Deal (what's dealt out), Win (how it's won), and
 * Twist (the joker rule, only when the variation has one).
 */

/** Win conditions that are NOT "best standard hand wins". */
const WIN_FLIPS = /worst|both win|closest|between|highest single/i

function dealLabel(variation) {
  const n = variation.cardsPerPlayer

  // Table cards mean a third badge (they always pair with a joker or a
  // long win label), and the full "3 cards each · 5 on table" wording
  // pushes the row onto a second line at phone width. Drop to the terse
  // form only in that case - the common two-badge result keeps the
  // friendlier wording.
  if (variation.tableCards > 0) {
    const each = n === 0 ? 'none' : `${n} each`
    return `${each} · ${variation.tableCards} table`
  }

  if (n === 0) return 'no hand'
  return `${n} ${n === 1 ? 'card' : 'cards'} each`
}

function winLabel(variation) {
  return WIN_FLIPS.test(variation.winner) ? 'Win flips' : 'Best hand wins'
}

/** Structured badges for the Result screen's pill row. */
export function summariseBadges(variation) {
  const badges = [
    { key: 'deal', label: dealLabel(variation), tone: 'teal' },
    { key: 'win', label: winLabel(variation), tone: 'pink' },
  ]

  if (variation.joker !== null) {
    badges.push({ key: 'twist', label: '★ Joker', tone: 'gold' })
  }

  return badges
}

/** Single flowing string, for the screen-reader announcement. */
export function summarise(variation, { sideshowBannedThisRound = false } = {}) {
  const base = summariseBadges(variation)
    .map((b) => b.label)
    .join(' · ')
  return sideshowBannedThisRound ? `${base} · Sideshow banned this round` : base
}
