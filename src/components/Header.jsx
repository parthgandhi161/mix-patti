import { MuteToggle } from './MuteToggle'
import { FullscreenToggle } from './FullscreenToggle'
import './Header.css'

/**
 * House-rules and all-twists buttons on the left, centred wordmark
 * (hidden on Home, where the hero title already says it), mute +
 * fullscreen toggles on the right - shown on every stage the header
 * appears on. Both side columns are a fixed 88px, enough for two 40px
 * circular buttons, so the wordmark stays exactly centred no matter
 * which optional buttons actually render inside them (fullscreen hides
 * itself on unsupported browsers, and again once already fullscreen).
 * The wordmark itself always stays mounted - just visibility-hidden on
 * Home - so the grid always has the same three children in the same
 * order; conditionally unmounting it would shift the right-side
 * buttons into the centre track instead.
 */
export function Header({ stage, muted, onToggleMute, onHouseRules, onBrowse, dim }) {
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
      </div>
    </header>
  )
}
