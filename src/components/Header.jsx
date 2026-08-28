import { MuteToggle } from './MuteToggle'
import { FullscreenToggle } from './FullscreenToggle'
import './Header.css'

/**
 * House-rules and all-twists buttons on the left, centred wordmark
 * (hidden on Home, where the hero title already says it), mute +
 * fullscreen + (while the player roster is empty) add-players on the
 * right - shown on every stage the header appears on. Both side columns
 * are a fixed 136px (see Header.css), wide enough for three 40px
 * circular buttons, so the wordmark stays exactly centred no matter how
 * many optional buttons actually render inside them (fullscreen hides
 * itself on unsupported browsers and again once already fullscreen;
 * add-players hides itself once a roster exists - Result's band-1
 * dealer line is the entry point from then on).
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
        {!hasPlayers && (
          <button
            type="button"
            className="appHeader__icon"
            onClick={onOpenPlayers}
            aria-label="Add players"
          >
            <span aria-hidden="true">+</span>
          </button>
        )}
      </div>
    </header>
  )
}
