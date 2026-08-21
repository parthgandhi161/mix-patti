import { MuteToggle } from './MuteToggle'
import './Header.css'

/**
 * One consistent header - centred wordmark, mute toggle on the right -
 * shown identically on Home, Mixing, and Result. A real layout row
 * (not floating corners), so the wordmark sits truly centred regardless
 * of the mute button's width: the left column is a same-size spacer.
 */
export function Header({ muted, onToggleMute }) {
  return (
    <header className="appHeader">
      <span className="appHeader__spacer" aria-hidden="true" />
      <span className="appHeader__word">Mix Patti</span>
      <MuteToggle muted={muted} onToggle={onToggleMute} />
    </header>
  )
}
