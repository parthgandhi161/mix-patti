import { MuteToggle } from './MuteToggle'
import { FullscreenToggle } from './FullscreenToggle'
import './Header.css'

/**
 * House-rules and all-twists buttons on the left, centred wordmark
 * (hidden on Home, where the hero title already says it), mute +
 * fullscreen + players on the right - shown on every stage the header
 * appears on. The players button is always visible, not just while the
 * roster is empty: it's the one reliable way back into the roster to add,
 * rename, reorder or remove someone, so hiding it once players exist
 * would strand anyone who needs to manage the list but isn't looking at
 * Result's dealer line (which only exists on that one stage, and only
 * once a dealer has been set). Both buttons open the same PlayersSheet;
 * only the label changes, "Add players" vs "Manage players", so it still
 * reads correctly for an empty roster. Both side columns are a fixed
 * 136px (see Header.css), wide enough for three 40px circular buttons, so
 * the wordmark stays exactly centred whether or not FullscreenToggle
 * (which hides itself on unsupported browsers and again once already
 * fullscreen) is currently rendering.
 * The wordmark itself always stays mounted - just visibility-hidden on
 * Home - so the grid always has the same three children in the same
 * order; conditionally unmounting it would shift the right-side
 * buttons into the centre track instead.
 */
export function Header({
  stage,
  muted,
  onToggleMute,
  onHouseRules,
  onBrowse,
  hasPlayers,
  onOpenPlayers,
  dim,
}) {
  return (
    <header className={`appHeader${dim ? ' appHeader--dim' : ''}`}>
      <div className="appHeader__side appHeader__side--left">
        <button
          type="button"
          className="appHeader__icon"
          onClick={onHouseRules}
          aria-label="House rules"
        >
          <span aria-hidden="true">☰</span>
        </button>
        <button
          type="button"
          className="appHeader__icon"
          onClick={onBrowse}
          aria-label="All twists"
        >
          <span aria-hidden="true">📖</span>
        </button>
      </div>

      <span
        className={`appHeader__word ${stage === 'home' ? 'appHeader__word--hidden' : ''}`}
        aria-hidden={stage === 'home' || undefined}
      >
        Mix Patti
      </span>

      <div className="appHeader__side appHeader__side--right">
        <FullscreenToggle />
        <MuteToggle muted={muted} onToggle={onToggleMute} />
        <button
          type="button"
          className="appHeader__icon"
          onClick={onOpenPlayers}
          aria-label={hasPlayers ? 'Manage players' : 'Add players'}
        >
          <span aria-hidden="true">👤</span>
        </button>
      </div>
    </header>
  )
}
