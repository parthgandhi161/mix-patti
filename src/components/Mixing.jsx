import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { CardBack, CardFace } from './Card'
import { TIMELINE, prefersReducedMotion } from '../lib/timing'
import { playShuffle, playSpin, playLand, stopAll } from '../lib/sound'
import { shuffled } from '../lib/pick'
import './Mixing.css'

const DECK = [0, 1, 2, 3, 4]
const FLIP_EASE = [0.3, 0.85, 0.35, 1]

/**
 * Stage 2 - the mix. Two phases, ~3.9s total:
 *
 *   shuffle (1.0s)  a riffling face-down deck            "mixing"
 *   reveal  (2.9s)  a single card flipping through real  "choosing"
 *                   card faces, decelerating, landing on
 *                   the winner
 *
 * The winning variation is decided by the parent *before* this
 * mounts, so the carousel is pure theatre - it always lands on
 * `variation`. Tapping anywhere skips straight to the result.
 *
 * The flip is the classic "flip clock" trick: two CardFaces are
 * stacked back-to-back inside one rotating wrapper. Whichever face is
 * currently turned away from the viewer gets its content swapped
 * *before* it rotates into view, so the name-change itself is never
 * seen - only the turn is.
 */
export function Mixing({ variation, variations, muted, onFinish }) {
  const [phase, setPhase] = useState('shuffle')
  const [pool] = useState(() =>
    shuffled(variations.filter((v) => v.id !== variation.id)),
  )
  const [reveal, setReveal] = useState(() => ({
    rotation: 0,
    step: 0,
    frontIsA: true, // which stacked face is currently facing the viewer
    contentA: pool[0],
    contentB: pool[1] ?? pool[0],
    flipMs: 160,
    landed: false,
  }))
  const done = useRef(false)

  const finish = () => {
    if (done.current) return
    done.current = true
    onFinish()
  }

  // --- phase clock ---------------------------------------------------
  useEffect(() => {
    const timers = []

    if (prefersReducedMotion()) {
      // Keep the reveal, drop the theatre. Landing this immediately
      // triggers the "hold briefly" effect below, which calls finish().
      setPhase('reveal')
      setReveal((r) => ({ ...r, contentA: variation, landed: true }))
      if (!muted) playLand()
    } else {
      if (!muted) playShuffle(TIMELINE.shuffle)
      timers.push(
        setTimeout(() => {
          setPhase('reveal')
          if (!muted) playSpin(TIMELINE.reveal)
        }, TIMELINE.shuffle),
      )
    }

    return () => {
      timers.forEach(clearTimeout)
      if (!done.current) stopAll()
    }
    // Runs once per mix; `muted` is read at mount on purpose so
    // toggling mid-animation doesn't restart the timeline.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // --- the carousel: decelerating flips, landing on `variation` -------
  useEffect(() => {
    if (phase !== 'reveal' || prefersReducedMotion()) return
    let timer
    const start = performance.now()

    const swap = () => {
      const elapsed = performance.now() - start
      const progress = Math.min(1, elapsed / TIMELINE.reveal)
      // Gap between flips stretches from ~90ms to ~400ms: the wheel
      // loses momentum. Each individual flip is a bit shorter than
      // the gap that follows it, so the card visibly rests a beat
      // before the next turn starts.
      const gap = 90 + 310 * progress ** 2.4
      const flipMs = Math.max(90, Math.min(260, gap * 0.55))
      const isFinal = progress >= 1

      setReveal((r) => {
        const nextStep = r.step + 1
        const content = isFinal ? variation : pool[nextStep % pool.length]
        return {
          rotation: r.rotation + 180,
          step: nextStep,
          frontIsA: !r.frontIsA,
          // Write into whichever face is currently turned away.
          contentA: r.frontIsA ? r.contentA : content,
          contentB: r.frontIsA ? content : r.contentB,
          flipMs,
          landed: isFinal,
        }
      })

      if (isFinal) {
        if (!muted) playLand()
        return
      }
      timer = setTimeout(swap, gap)
    }

    timer = setTimeout(swap, 90)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  // Hold briefly on the landing flourish before handing off to Result.
  useEffect(() => {
    if (!reveal.landed) return
    const t = setTimeout(finish, 420)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reveal.landed])

  const handleSkip = () => {
    if (done.current) return
    stopAll()
    if (!muted) playLand()
    finish()
  }

  return (
    <div
      className="stage mixing"
      onClick={handleSkip}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') handleSkip()
      }}
      aria-label="Mixing. Tap to skip"
    >
      <div className="mixing__well">
        {phase === 'shuffle' && (
          <div className="deck">
            {DECK.map((i) => (
              <div
                className="deck__slot"
                key={i}
                style={{ animationDelay: `${i * 85}ms` }}
              >
                <CardBack />
              </div>
            ))}
          </div>
        )}

        {phase === 'reveal' && (
          <div className="reveal">
            <div
              className={`reveal__glow ${
                reveal.landed ? 'reveal__glow--pulse' : ''
              }`}
              aria-hidden="true"
            />
            <motion.div
              className="reveal__flipper"
              animate={{
                rotateY: reveal.rotation,
                scale: reveal.landed ? [1, 1.06, 1] : 1,
              }}
              transition={{
                rotateY: { duration: reveal.flipMs / 1000, ease: FLIP_EASE },
                scale: {
                  duration: 0.26,
                  ease: 'easeOut',
                  delay: reveal.flipMs / 1000,
                },
              }}
            >
              <div className="reveal__face reveal__face--a">
                <CardFace
                  variation={reveal.contentA}
                  shimmer={reveal.landed && reveal.frontIsA}
                />
              </div>
              <div className="reveal__face reveal__face--b">
                <CardFace
                  variation={reveal.contentB}
                  shimmer={reveal.landed && !reveal.frontIsA}
                />
              </div>
            </motion.div>
          </div>
        )}
      </div>

      <p className="mixing__status">
        {phase === 'shuffle' && 'mixing'}
        {phase === 'reveal' && !reveal.landed && 'choosing'}
      </p>
      <p className="mixing__skip">tap to skip</p>
    </div>
  )
}
