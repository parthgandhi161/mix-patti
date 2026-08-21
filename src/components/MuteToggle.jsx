import './MuteToggle.css'

export function MuteToggle({ muted, onToggle }) {
  return (
    <button
      type="button"
      className="mute"
      onClick={onToggle}
      aria-pressed={muted}
      aria-label={muted ? 'Unmute sound' : 'Mute sound'}
      title={muted ? 'Unmute' : 'Mute'}
    >
      <span aria-hidden="true">{muted ? '🔇' : '🔊'}</span>
    </button>
  )
}
