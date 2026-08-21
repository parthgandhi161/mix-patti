import { motion } from 'framer-motion'
import './Sheet.css'

const SLIDE = {
  initial: { y: '100%' },
  animate: { y: 0, transition: { duration: 0.26, ease: [0.3, 0.85, 0.35, 1] } },
  exit: { y: '100%', transition: { duration: 0.2, ease: 'easeIn' } },
}

const HOUSE_RULES = [
  'Natural beats joker. A natural hand beats a joker-made hand of the same rank.',
  'Still tied? Replay the round.',
  'Ace is high unless a twist says otherwise.',
  'Dealer settles disputes for that round. Argue after, not during.',
]

/**
 * Stage 5 - the four global rules. Separate sheet from the per-
 * variation rules, reachable from Stage 3 via the house-rules button.
 */
export function HouseRulesSheet({ onClose }) {
  return (
    <motion.div
      className="sheet"
      variants={SLIDE}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      <div className="sheet__head">
        <h2 className="sheet__title">House rules</h2>
        <button
          type="button"
          className="sheet__close"
          onClick={onClose}
          aria-label="Close house rules"
        >
          ×
        </button>
      </div>

      <div className="sheet__body">
        <section>
          <ol className="sheet__list">
            {HOUSE_RULES.map((rule, i) => (
              <li key={i}>{rule}</li>
            ))}
          </ol>
        </section>
      </div>
    </motion.div>
  )
}
