import { useState } from 'react'
import { motion } from 'framer-motion'
import { useReadingMode } from '../lib/useReadingMode'
import './Sheet.css'

const SLIDE = {
  initial: { y: '100%' },
  animate: { y: 0, transition: { duration: 0.26, ease: [0.3, 0.85, 0.35, 1] } },
  exit: { y: '100%', transition: { duration: 0.2, ease: 'easeIn' } },
}

// Not exported: only used here, and react/only-export-components warns
// on a file that mixes a component export with a non-component one.
function buildSteps(variation) {
  const steps = []

  if (variation.joker !== null) {
    steps.push({ label: 'Joker', text: variation.joker, tone: 'gold' })
  }
  for (const text of variation.setup) {
    steps.push({ label: 'Setup', text, tone: '' })
  }
  for (const text of variation.play) {
    steps.push({ label: 'Play', text, tone: '' })
  }
  steps.push({ label: 'How you win', text: variation.winner, tone: 'pink' })
  if (variation.notes?.trim()) {
    steps.push({ label: 'Agree upfront', text: variation.notes, tone: 'muted' })
  }

  return steps
}

/**
 * Stage 4 - per-variation rules. Slides up over the result, full
 * screen. Two reading modes, toggled from the head:
 *
 * - dense (default): today's always-scrolling section list. Sections
 *   are skipped when their data is empty, in spec order: joker, setup,
 *   play, how you win, upfront notes.
 * - explain: the same data flattened to one step per item (one setup
 *   line, one play line, etc.), shown large, one at a time, for a
 *   dealer reading it aloud across a table. Remembered across sessions
 *   via useReadingMode; the step index itself does not persist and
 *   always starts at 0, since every open of this component is a fresh
 *   mount (App.jsx never re-renders it in place with a new variation).
 */
export function RulesSheet({ variation, onClose }) {
  const [mode, toggleMode] = useReadingMode()
  const [stepIndex, setStepIndex] = useState(0)
  const isExplain = mode === 'explain'

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
        <div className="rulesSheet__headActions">
          <button
            type="button"
            className="rulesSheet__modeToggle"
            onClick={toggleMode}
            aria-pressed={isExplain}
            aria-label={isExplain ? 'Switch to full rules' : 'Switch to explain mode'}
            title={isExplain ? 'Full rules' : 'Explain mode'}
          >
            <span aria-hidden="true">{isExplain ? '🗣️' : '📜'}</span>
          </button>
          <button
            type="button"
            className="sheet__close"
            onClick={onClose}
            aria-label="Close rules"
          >
            ×
          </button>
        </div>
      </div>

      {isExplain ? (
        <RulesStepper
          variation={variation}
          stepIndex={stepIndex}
          onStepIndexChange={setStepIndex}
        />
      ) : (
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
      )}
    </motion.div>
  )
}

function RulesStepper({ variation, stepIndex, onStepIndexChange }) {
  const steps = buildSteps(variation)
  const step = steps[stepIndex]
  const atFirst = stepIndex === 0
  const atLast = stepIndex === steps.length - 1

  return (
    <>
      {/* aria-live lives on this stable wrapper, which never remounts -
          only the keyed child below does, on every step change. A live
          region that is itself unmounted/remounted on each update is
          unreliable across assistive tech; keeping the root stable and
          swapping only its content is the version that announces
          correctly. */}
      <div className="sheet__body" aria-live="polite" aria-atomic="true">
        <div key={stepIndex} className="rulesSheet__step">
          <h3
            className={`sheet__heading${step.tone ? ` sheet__heading--${step.tone}` : ''}`}
          >
            {step.label}
          </h3>
          <p className="rulesSheet__stepText">{step.text}</p>
        </div>
      </div>

      <div className="rulesSheet__stepNav">
        <button
          type="button"
          className="btn btn--ghost rulesSheet__navBtn"
          onClick={() => onStepIndexChange(stepIndex - 1)}
          disabled={atFirst}
          aria-label="Previous step"
        >
          ‹ Back
        </button>
        <span className="rulesSheet__stepCount">
          {stepIndex + 1} / {steps.length}
        </span>
        <button
          type="button"
          className="btn btn--ghost rulesSheet__navBtn"
          onClick={() => onStepIndexChange(stepIndex + 1)}
          disabled={atLast}
          aria-label="Next step"
        >
          Next ›
        </button>
      </div>
    </>
  )
}
