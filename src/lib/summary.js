/**
 * The quiet summary under the variation name (Stage 3), broken into up
 * to three badges: Deal (what's dealt out), Win (how it's won), and
 * Twist (the joker rule, only when the variation has one).
 */

/** Win conditions that are NOT "best standard hand wins". */
const WIN_FLIPS = /worst|both win|closest|between|highest single/i

function dealLabel(variation) {
  let label =
    variation.cardsPerPlayer === 0
      ? 'no hand'
      : `${variation.cardsPerPlayer} ${
          variation.cardsPerPlayer === 1 ? 'card' : 'cards'
        } each`

  if (variation.tableCards > 0) {
    label += ` · ${variation.tableCards} on table`
  }

  return label
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
export function summarise(variation) {
  return summariseBadges(variation)
    .map((b) => b.label)
    .join(' · ')
}
