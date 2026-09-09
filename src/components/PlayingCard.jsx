import './PlayingCard.css'

const SUIT_GLYPH = { S: '♠', H: '♥', D: '♦', C: '♣' }
const RED_SUITS = new Set(['H', 'D'])

/**
 * A rank+suit card slot for Hand Judge - deliberately separate from
 * Card.jsx, which renders twist-name cards, not playing cards. Renders
 * as a button when `onClick` is given (the tappable entry slots) or a
 * plain span otherwise (the verdict's read-only rows), at `size`
 * 'normal' (the two hands as entered) or 'mini' (the converted-hand row).
 */
export function PlayingCard({
  card,
  size = 'normal',
  active = false,
  tag = null,
  changed = false,
  onClick,
  ariaLabel,
}) {
  const empty = !card
  const className = [
    'playingCard',
    `playingCard--${size}`,
    empty && 'playingCard--empty',
    active && 'playingCard--active',
    changed && 'playingCard--changed',
  ]
    .filter(Boolean)
    .join(' ')

  const content = empty ? (
    <span className="playingCard__plus" aria-hidden="true">
      +
    </span>
  ) : (
    <span
      className={`playingCard__rank playingCard__rank--${RED_SUITS.has(card.suit) ? 'red' : 'black'}`}
    >
      {card.rank}
      <span aria-hidden="true">{SUIT_GLYPH[card.suit]}</span>
    </span>
  )

  const label =
    ariaLabel ??
    (empty ? 'Empty card, tap to fill' : `${card.rank} of ${card.suit}, tap to change`)

  if (!onClick) {
    return (
      <span className={className}>
        {content}
        {tag && <span className="playingCard__tag">{tag}</span>}
      </span>
    )
  }

  return (
    <button type="button" className={className} onClick={onClick} aria-label={label}>
      {content}
      {tag && <span className="playingCard__tag">{tag}</span>}
    </button>
  )
}
