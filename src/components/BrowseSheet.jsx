import { useState } from 'react'
import { motion } from 'framer-motion'
import './Sheet.css'

const SLIDE = {
  initial: { y: '100%' },
  animate: { y: 0, transition: { duration: 0.26, ease: [0.3, 0.85, 0.35, 1] } },
  exit: { y: '100%', transition: { duration: 0.2, ease: 'easeIn' } },
}

// Same suit/colour pairing as FloatingSuits.jsx's background glyphs, so
// this reads as the same deck rather than a second decoration scheme.
// Purely a per-row visual rhythm - cycled by list position, not tied to
// the variation itself.
const SUITS = ['♠', '♥', '♦', '♣']
const SUIT_COLORS = ['var(--gold)', 'var(--pink)', 'var(--teal)', 'var(--lav)']

function matches(variation, query) {
  if (!query) return true
  if (variation.name.toLowerCase().includes(query)) return true
  return variation.alsoKnownAs.some((aka) => aka.toLowerCase().includes(query))
}

/**
 * Stage 6 - every twist, searchable by name or alias. Selecting a row
 * opens RulesSheet on top (see App.jsx's browseTarget); closing that
 * lands back here, not on the result stage. `inert` while a row's
 * RulesSheet covers this sheet keeps Tab from reaching the close
 * button hidden underneath it - there's no focus trap anywhere else in
 * this app, so without it Shift+Tab could reach and activate this
 * sheet's own close button while still visually buried.
 */
export function BrowseSheet({ variations, browseTarget, onClose, onSelect }) {
  const [query, setQuery] = useState('')

  const q = query.trim().toLowerCase()
  const results = [...variations]
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter((variation) => matches(variation, q))

  return (
    <motion.div
      className="sheet"
      variants={SLIDE}
      initial="initial"
      animate="animate"
      exit="exit"
      inert={browseTarget ? true : undefined}
    >
      <div className="sheet__head">
        <h2 className="sheet__title">All twists</h2>
        <button
          type="button"
          className="sheet__close"
          onClick={onClose}
          aria-label="Close all twists"
        >
          ×
        </button>
      </div>

      <div className="sheet__body">
        <div className="browseSheet__search">
          <label className="sr-only" htmlFor="browse-search">
            Search twists by name
          </label>
          <input
            id="browse-search"
            type="search"
            className="browseSheet__input"
            placeholder="Search twists…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {results.length === 0 ? (
          <p className="browseSheet__empty">No twists match "{query}".</p>
        ) : (
          <ul className="browseSheet__list">
            {results.map((variation, i) => (
              <li key={variation.id}>
                <button
                  type="button"
                  className="browseSheet__row"
                  onClick={() => onSelect(variation)}
                >
                  <span
                    className="browseSheet__suit"
                    style={{ color: SUIT_COLORS[i % SUIT_COLORS.length] }}
                    aria-hidden="true"
                  >
                    {SUITS[i % SUITS.length]}
                  </span>
                  <span className="browseSheet__name">{variation.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </motion.div>
  )
}
