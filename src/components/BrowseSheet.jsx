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

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'starred', label: '★ Starred' },
  { key: 'muted', label: '🔕 Muted' },
]

/**
 * Stage 6 - every twist, searchable by name or alias. Selecting a row
 * opens RulesSheet on top (see App.jsx's browseTarget); closing that
 * lands back here, not on the result stage. `inert` while a row's
 * RulesSheet covers this sheet keeps Tab from reaching the close
 * button hidden underneath it - there's no focus trap anywhere else in
 * this app, so without it Shift+Tab could reach and activate this
 * sheet's own close button while still visually buried.
 *
 * Each row also carries star/mute toggles, plus an All/Starred/Muted
 * filter above the list so a group can review what they've done. Muted
 * rows stay fully visible and openable here - muting only removes a
 * twist from the draw (src/lib/pick.js), never from the rulebook.
 */
export function BrowseSheet({
  variations,
  browseTarget,
  onClose,
  onSelect,
  isStarred,
  isMuted,
  onToggleStar,
  onToggleMute,
  canToggleMute,
}) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')

  const q = query.trim().toLowerCase()
  const results = [...variations]
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter((variation) => matches(variation, q))
    .filter((variation) => {
      if (filter === 'starred') return isStarred(variation.id)
      if (filter === 'muted') return isMuted(variation.id)
      return true
    })

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

        <div className="browseSheet__filters" role="group" aria-label="Filter twists">
          {FILTERS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              className="browseSheet__filterBtn"
              aria-pressed={filter === key}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {results.length === 0 ? (
          <p className="browseSheet__empty">
            {query ? `No twists match "${query}".` : 'No twists in this filter yet.'}
          </p>
        ) : (
          <ul className="browseSheet__list">
            {results.map((variation, i) => {
              const starred = isStarred(variation.id)
              const muted = isMuted(variation.id)
              return (
                <li
                  key={variation.id}
                  className={`browseSheet__item${muted ? ' browseSheet__item--muted' : ''}`}
                >
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
                  <div className="browseSheet__rowActions">
                    <button
                      type="button"
                      className="browseSheet__iconBtn"
                      onClick={() => onToggleStar(variation.id)}
                      aria-pressed={starred}
                      aria-label={starred ? `Unstar ${variation.name}` : `Star ${variation.name}`}
                      title={starred ? 'Unstar' : 'Star (drawn more often)'}
                    >
                      <span aria-hidden="true">{starred ? '★' : '☆'}</span>
                    </button>
                    <button
                      type="button"
                      className="browseSheet__iconBtn browseSheet__iconBtn--mute"
                      onClick={() => onToggleMute(variation.id)}
                      disabled={!muted && !canToggleMute(variation.id)}
                      aria-pressed={muted}
                      aria-label={muted ? `Unmute ${variation.name}` : `Mute ${variation.name}`}
                      title={muted ? 'Unmute (back in the draw)' : 'Mute (never drawn)'}
                    >
                      <span aria-hidden="true">{muted ? '🔕' : '🔔'}</span>
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </motion.div>
  )
}
