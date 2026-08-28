import { useState } from 'react'
import { motion } from 'framer-motion'
import './Sheet.css'

const SLIDE = {
  initial: { y: '100%' },
  animate: { y: 0, transition: { duration: 0.26, ease: [0.3, 0.85, 0.35, 1] } },
  exit: { y: '100%', transition: { duration: 0.2, ease: 'easeIn' } },
}

/**
 * Stage 7 - the optional roster behind Result's band-1 dealer line.
 * Add/rename/reorder/remove players; tapping a row makes that player
 * dealer immediately - the one-tap correction path for a skipped turn or
 * a player joining mid-night. Reorder is up/down buttons rather than
 * drag: no drag-and-drop library in this repo, native HTML5 drag doesn't
 * work on touch, and per-row buttons avoid any gesture ambiguity with the
 * same row's dealer-select tap target.
 */
export function PlayersSheet({
  players,
  dealerIndex,
  onAdd,
  onRename,
  onRemove,
  onMove,
  onSetDealer,
  onClear,
  onClose,
}) {
  const [draft, setDraft] = useState('')
  const [editingId, setEditingId] = useState(null)

  const handleAdd = (e) => {
    e.preventDefault()
    onAdd(draft)
    setDraft('')
  }

  const commitRename = (id, value) => {
    onRename(id, value)
    setEditingId(null)
  }

  return (
    <motion.div className="sheet" variants={SLIDE} initial="initial" animate="animate" exit="exit">
      <div className="sheet__head">
        <h2 className="sheet__title">Players</h2>
        <button
          type="button"
          className="sheet__close"
          onClick={onClose}
          aria-label="Close players"
        >
          ×
        </button>
      </div>

      <div className="sheet__body">
        <form className="playersSheet__add" onSubmit={handleAdd}>
          <label className="sr-only" htmlFor="player-add-input">
            Add a player
          </label>
          <input
            id="player-add-input"
            type="text"
            className="playersSheet__input"
            placeholder="Add a player…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={24}
          />
          <button
            type="submit"
            className="btn btn--gold playersSheet__addBtn"
            disabled={!draft.trim()}
          >
            Add
          </button>
        </form>

        {players.length === 0 ? (
          <p className="playersSheet__empty">
            No players yet. Add names to rotate a dealer automatically each mix.
          </p>
        ) : (
          <>
            <ul className="playersSheet__list">
              {players.map((player, i) => (
                <li key={player.id} className="playersSheet__row">
                  {editingId === player.id ? (
                    <input
                      type="text"
                      className="playersSheet__renameInput"
                      defaultValue={player.name}
                      maxLength={24}
                      autoFocus
                      onBlur={(e) => commitRename(player.id, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur()
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className={`playersSheet__nameBtn${
                        i === dealerIndex ? ' playersSheet__nameBtn--dealer' : ''
                      }`}
                      onClick={() => onSetDealer(i)}
                    >
                      {i === dealerIndex && (
                        <span className="playersSheet__dealerDot" aria-hidden="true" />
                      )}
                      <span className="playersSheet__name">{player.name}</span>
                    </button>
                  )}

                  <div className="playersSheet__rowActions">
                    <button
                      type="button"
                      className="playersSheet__iconBtn"
                      onClick={() => setEditingId(player.id)}
                      aria-label={`Rename ${player.name}`}
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      className="playersSheet__iconBtn"
                      onClick={() => onMove(player.id, -1)}
                      disabled={i === 0}
                      aria-label={`Move ${player.name} up`}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="playersSheet__iconBtn"
                      onClick={() => onMove(player.id, 1)}
                      disabled={i === players.length - 1}
                      aria-label={`Move ${player.name} down`}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="playersSheet__iconBtn playersSheet__iconBtn--danger"
                      onClick={() => onRemove(player.id)}
                      aria-label={`Remove ${player.name}`}
                    >
                      ×
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            <button type="button" className="btn btn--ghost playersSheet__clear" onClick={onClear}>
              Clear all players
            </button>
          </>
        )}
      </div>
    </motion.div>
  )
}
