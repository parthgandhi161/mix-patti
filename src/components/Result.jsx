import { CardFace } from './Card'
import { summarise, summariseBadges } from '../lib/summary'
import './Result.css'

/**
 * Stage 3 - home base after every mix.
 *
 * Deliberately just the name plus a short summary. Once you've played
 * a twist once, these badges are all you need; full rules stay behind
 * "Show rules".
 */
export function Result({ variation, onMixAgain, onShowRules }) {
  return (
    <div className="stage result">
      <div className="result__main">
        <CardFace variation={variation} className="result__card" shimmer />

        {/* aria-live so a screen reader announces each new mix as one
            flowing string; the visible pills are decorative duplicates. */}
        <div className="result__badges" aria-live="polite">
          <span className="sr-only">{summarise(variation)}</span>
          {summariseBadges(variation).map((badge) => (
            <span
              key={badge.key}
              className={`result__badge result__badge--${badge.tone}`}
              aria-hidden="true"
            >
              {badge.label}
            </span>
          ))}
        </div>

        <button
          type="button"
          className="btn btn--outline result__rules"
          onClick={onShowRules}
        >
          Show rules
        </button>
      </div>

      <footer className="result__foot">
        <button
          type="button"
          className="btn btn--gold result__mix"
          onClick={onMixAgain}
        >
          <span aria-hidden="true">↻</span> Mix again
        </button>
      </footer>
    </div>
  )
}
