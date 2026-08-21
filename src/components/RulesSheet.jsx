import { motion } from 'framer-motion'
import './Sheet.css'

const SLIDE = {
  initial: { y: '100%' },
  animate: { y: 0, transition: { duration: 0.26, ease: [0.3, 0.85, 0.35, 1] } },
  exit: { y: '100%', transition: { duration: 0.2, ease: 'easeIn' } },
}

/**
 * Stage 4 - per-variation rules. Slides up over the result, full
 * screen. Sections are skipped when their data is empty, in the
 * order the spec lays out: joker first, then setup, play, how you
 * win, and finally the upfront notes.
 */
export function RulesSheet({ variation, onClose }) {
  return (
    <motion.div
      className="sheet"
      variants={SLIDE}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      <div className="sheet__head">
        <h2 className="sheet__title">{variation.name}</h2>
        <button
          type="button"
          className="sheet__close"
          onClick={onClose}
          aria-label="Close rules"
        >
          ×
        </button>
      </div>

      <div className="sheet__body">
        {variation.joker !== null && (
          <section>
            <h3 className="sheet__heading sheet__heading--gold">★ Joker</h3>
            <p className="sheet__text">{variation.joker}</p>
          </section>
        )}

        <section>
          <h3 className="sheet__heading">Setup · once</h3>
          <ol className="sheet__list">
            {variation.setup.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </section>

        <section>
          <h3 className="sheet__heading">Play · each round</h3>
          <ol className="sheet__list">
            {variation.play.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </section>

        <section>
          <h3 className="sheet__heading sheet__heading--pink">How you win</h3>
          <p className="sheet__text">{variation.winner}</p>
        </section>

        {variation.notes?.trim() && (
          <section>
            <h3 className="sheet__heading sheet__heading--muted">
              Agree upfront
            </h3>
            <p className="sheet__text">{variation.notes}</p>
          </section>
        )}
      </div>
    </motion.div>
  )
}
