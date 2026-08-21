import { useState } from 'react'
import './FloatingSuits.css'

const SUITS = ['♠', '♥', '♦', '♣']
const COLORS = ['var(--gold)', 'var(--pink)', 'var(--teal)', 'var(--lav)']

/**
 * Faint drifting suit glyphs behind the idle and result screens - pure
 * decoration, `pointer-events: none`, never shown during Mixing (the
 * spec wants that screen to dim and hide everything else for focus).
 *
 * Randomised once per mount via useMemo, so every time this remounts
 * (each time you land back on a stage that renders it) the scatter is
 * a little different - a nice bit of variety, not a bug.
 */
export function FloatingSuits({ count = 12 }) {
  const [glyphs] = useState(() =>
    Array.from({ length: count }, () => ({
      suit: SUITS[Math.floor(Math.random() * SUITS.length)],
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: 18 + Math.random() * 30,
      rotate: Math.random() * 40 - 20,
      duration: 9 + Math.random() * 7,
      delay: Math.random() * -20,
      opacity: 0.05 + Math.random() * 0.07,
    })),
  )

  return (
    <div className="suits" aria-hidden="true">
      {glyphs.map((g, i) => (
        <span
          key={i}
          className="suits__glyph"
          style={{
            left: `${g.x}%`,
            top: `${g.y}%`,
            color: g.color,
            opacity: g.opacity,
            fontSize: g.size,
            '--r': `${g.rotate}deg`,
            animationDuration: `${g.duration}s`,
            animationDelay: `${g.delay}s`,
          }}
        >
          {g.suit}
        </span>
      ))}
    </div>
  )
}
