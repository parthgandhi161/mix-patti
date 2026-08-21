import './Card.css'

const SUITS = ['♠', '♥', '♦', '♣'] // ♠ ♥ ♦ ♣

/**
 * Pick a stable suit for a variation, so the same twist always shows
 * the same corners. A tiny string hash, not cryptography.
 */
function suitFor(id = '') {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return SUITS[h % SUITS.length]
}

/** The face-down side: gold monogram on a plum lattice. */
export function CardBack({ className = '' }) {
  return (
    <div className={`card card--back ${className}`}>
      <div className="card__lattice" aria-hidden="true" />
      <div className="card__medallion">
        <span className="card__monogram">MP</span>
      </div>
    </div>
  )
}

/**
 * The face-up side: the variation name with suit corners.
 *
 * `shimmer` plays a one-shot gloss sweep - opt in only where a card
 * actually "lands" (the result screen, the carousel's final frame),
 * never on every carousel swap, which would just be visual noise.
 */
export function CardFace({ variation, className = '', shimmer = false }) {
  const suit = suitFor(variation?.id)
  const isRed = suit === '♥' || suit === '♦'

  return (
    <div
      className={`card card--face ${shimmer ? 'card--shimmer' : ''} ${className}`}
    >
      <span className="card__watermark" aria-hidden="true">
        {suit}
      </span>
      <span
        className={`card__pip card__pip--tl ${isRed ? 'is-red' : ''}`}
        aria-hidden="true"
      >
        {suit}
      </span>
      <h2 className="card__name">{variation?.name}</h2>
      <span className="card__divider" aria-hidden="true" />
      <span
        className={`card__pip card__pip--br ${isRed ? 'is-red' : ''}`}
        aria-hidden="true"
      >
        {suit}
      </span>
    </div>
  )
}
