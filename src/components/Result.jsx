import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CardFace } from './Card'
import { summarise, summariseBadges } from '../lib/summary'
import { playBanRiser, playBanSting, stopAll } from '../lib/sound'
import { prefersReducedMotion } from '../lib/timing'
import './Result.css'

// How long the big reveal holds before shrinking into its corner. Owned
// here rather than lib/timing.js's TIMELINE - that file is specifically
// the Mixing handoff timeline, and this is a Result-local flourish.
// Passed into both playBanRiser() (so the riser's sting lands exactly as
// this fires) and the settle timer below - one source, so the two can't
// drift the way a stray duplicated duration once did in this app.
const REVEAL_HOLD_MS = 2600

// Delay before the big reveal starts at all, clearing App.jsx's 220ms
// stage crossfade so the reveal's own pop-in doesn't compound with the
// stage still fading in - the same clearance the original single-pill
// version used at this exact value.
const REVEAL_ENTER_DELAY_MS = 550

// The big <-> settled swap is a Framer Motion shared-layout transition
// (matching layoutId below), not a hand-computed transform: an earlier
// version tried to fake "grow big, then shrink into the corner" with a
// single element's scale + percentage x/y offsets, and measuring it
// confirmed the offsets compounded with the scale in a way that pushed
// the badge nearly a third off the left edge of the screen, clipped by
// .shell's overflow: hidden. layoutId sidesteps that entirely - Framer
// Motion measures each element's actual rendered box (however it's
// positioned) and animates the real delta between them, so there's no
// percentage arithmetic to get wrong.
const BAN_REVEAL_TRANSITION = {
  layout: { duration: 0.45, ease: [0.3, 0.85, 0.35, 1] },
  opacity: { duration: 0.3 },
}

const OVERLAY_FADE = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.18 } },
  exit: { opacity: 0, transition: { duration: 0.3 } },
}

/**
 * Stage 3 - home base after every mix.
 *
 * Deliberately just the name plus a short summary. Once you've played
 * a twist once, these badges are all you need; full rules stay behind
 * "Show rules".
 */
export function Result({
  variation,
  sideshowBannedThisRound = false,
  onMixAgain,
  onShowRules,
}) {
  // Read once, so this can't flip mid-reveal - same reasoning as
  // Mixing.jsx's own [reduced] state.
  const [reduced] = useState(prefersReducedMotion)
  const [revealStarted, setRevealStarted] = useState(reduced)
  const [revealPhase, setRevealPhase] = useState(reduced ? 'settled' : 'big')
  const holdTimer = useRef(null)
  // True once this round's reveal has resolved (naturally, via skip, or
  // n/a) - mirrors Mixing.jsx's `done` ref, gates the unmount cleanup's
  // stopAll() so it only fires on a genuinely still-live sequence.
  const resolved = useRef(false)

  useEffect(() => {
    if (!sideshowBannedThisRound) return

    if (reduced) {
      // Keep the reveal, drop the theatre: skip straight to the small
      // pill (already this component's initial state under reduced
      // motion) and just land the sting once.
      playBanSting()
      resolved.current = true
      return
    }

    const enterTimer = setTimeout(() => {
      setRevealStarted(true)
      playBanRiser(REVEAL_HOLD_MS)
      holdTimer.current = setTimeout(() => {
        resolved.current = true
        setRevealPhase('settled')
      }, REVEAL_HOLD_MS)
    }, REVEAL_ENTER_DELAY_MS)

    return () => {
      clearTimeout(enterTimer)
      clearTimeout(holdTimer.current)
      if (!resolved.current) stopAll()
    }
    // Runs once per mount - each round remounts Result fresh, so state
    // here never carries over between rounds.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSkip = () => {
    if (resolved.current) return
    resolved.current = true
    clearTimeout(holdTimer.current)
    stopAll()
    playBanSting()
    setRevealPhase('settled')
  }

  const bigRevealActive =
    sideshowBannedThisRound && revealStarted && revealPhase === 'big'

  return (
    <div className="stage result">
      <div className="stage__card">
        <div className="result__cardWrap">
          <CardFace variation={variation} className="result__card" />
          {sideshowBannedThisRound &&
            revealStarted &&
            (revealPhase === 'big' ? (
              <motion.div
                key="big"
                layoutId="banBadge"
                className="result__banStamp result__banStamp--big"
                aria-hidden="true"
                // x/y re-declared here (not left to the CSS class's
                // `transform: translate(-50%, -50%)`) because animating
                // `scale` makes Framer Motion own the element's inline
                // transform outright - a plain CSS transform on the same
                // element gets silently overwritten the instant Framer
                // Motion writes its own, which is exactly what made this
                // appear off-center (anchored by its top-left corner
                // instead of its middle) the first time around.
                initial={{ opacity: 0, scale: 0.6, x: '-50%', y: '-50%' }}
                animate={{ opacity: 1, scale: 1, x: '-50%', y: '-50%' }}
                transition={BAN_REVEAL_TRANSITION}
              >
                <span className="result__banIcon" aria-hidden="true" />
                <span className="result__banStampLabel">No Sideshow</span>
              </motion.div>
            ) : (
              <motion.div
                key="settled"
                layoutId="banBadge"
                className="result__banStamp result__banStamp--settled"
                aria-hidden="true"
                transition={BAN_REVEAL_TRANSITION}
              >
                <span className="result__banIcon" aria-hidden="true" />
                <span className="result__banStampLabel">No Sideshow</span>
              </motion.div>
            ))}
        </div>
      </div>

      {/* aria-live so a screen reader announces each new mix as one
          flowing string; the visible pills are decorative duplicates. */}
      <div className="stage__under">
        <div className="result__badges" aria-live="polite">
          <span className="sr-only">
            {summarise(variation, { sideshowBannedThisRound })}
          </span>
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
      </div>

      <div className="stage__foot">
        <button
          type="button"
          className="btn btn--outline result__rules"
          onClick={onShowRules}
          disabled={bigRevealActive}
        >
          Show rules
        </button>

        <button
          type="button"
          className="btn btn--gold result__mix"
          onClick={onMixAgain}
          disabled={bigRevealActive}
        >
          <span aria-hidden="true">↻</span> Mix again
        </button>
      </div>

      <AnimatePresence>
        {bigRevealActive && (
          <motion.div
            key="revealOverlay"
            className="result__revealOverlay"
            variants={OVERLAY_FADE}
            initial="initial"
            animate="animate"
            exit="exit"
            onClick={handleSkip}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') handleSkip()
            }}
            aria-label="No sideshow this round. Tap to skip"
          >
            <p className="result__revealSkip">tap to skip</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
