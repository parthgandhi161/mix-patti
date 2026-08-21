import { useEffect, useRef, useState } from 'react'
import { motion, useMotionValue, useTransform } from 'framer-motion'
import { CardBack, CardFace } from './Card'
import { TIMELINE, prefersReducedMotion } from '../lib/timing'
import { playShuffle, playFlip, playLand, stopAll } from '../lib/sound'
import { shuffled } from '../lib/pick'
import './Mixing.css'

const DECK = [0, 1, 2, 3, 4]
const FLIP_EASE = [0.3, 0.85, 0.35, 1]
const FAN = [0, 1, 2, 3, 4]
const HERO = 2
const FAN_TRANSITION = 'transform 460ms cubic-bezier(0.22, 1.28, 0.36, 1), opacity 300ms ease'

/** Inline transform for a side card: stacked -> fanned -> collapsed away on landing. */
function fanTransform(offset, fanned, landed) {
  if (landed) {
    return `translate(${offset * 90}px, 70px) rotate(${offset * 8}deg) scale(0.8)`
  }
  if (fanned) {
    return `translate(calc(${offset} * clamp(46px, 15vw, 62px)), ${Math.abs(offset) * 14}px) rotate(${offset * 12}deg)`
  }
  return 'translate(0, 0) rotate(0deg)'
}

/**
 * Stage 2 - the mix. Two phases (durations from `TIMELINE`, currently
 * slowed for on-device mobile-flip diagnosis - see timing.js):
 *
 *   shuffle  a riffling face-down deck                    "mixing"
 *   reveal   a single card flipping through real card      "choosing"
 *            faces, decelerating, landing on the winner
 *
 * The winning variation is decided by the parent *before* this
 * mounts, so the carousel is pure theatre - it always lands on
 * `variation`. Tapping anywhere skips straight to the result.
 *
 * The flip is the classic "flip clock" trick: a CardFace and a
 * CardBack are stacked back-to-back inside one rotating wrapper, so
 * each decelerating turn shows back, then a new name, then back
 * again, like a real card being riffled and re-peeked at. The name
 * face's content is swapped *while it's turned away* (mid-turn,
 * showing the back), so the change itself is never seen mid-flip.
 */
export function Mixing({ variation, variations, muted, onFinish }) {
  const [phase, setPhase] = useState('shuffle')
  const [pool] = useState(() =>
    shuffled(variations.filter((v) => v.id !== variation.id)),
  )
  const [reveal, setReveal] = useState(() => ({
    rotation: 0,
    step: 0,
    content: pool[0],
    flipMs: 160,
    landed: false,
  }))
  const [fanned, setFanned] = useState(false)
  const done = useRef(false)

  // Some mobile WebKit builds stop honouring `backface-visibility: hidden`
  // once the rotating parent's transform is a JS-driven matrix3d (which is
  // how Framer Motion animates rotateY) - the away-facing card ghosts
  // through instead of staying hidden. Rather than trust the browser's 3D
  // compositing, track the live rotation ourselves and explicitly hide
  // whichever face is turned away, in sync with the same 90deg boundary
  // backface-visibility would use.
  const rotateY = useMotionValue(0)
  const facingFront = useTransform(rotateY, (v) => {
    const f = ((v % 360) + 360) % 360
    return f < 90 || f > 270
  })
  const faceAVisibility = useTransform(facingFront, (front) =>
    front ? 'visible' : 'hidden',
  )
  const faceBVisibility = useTransform(facingFront, (front) =>
    front ? 'hidden' : 'visible',
  )

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
      setReveal((r) => ({ ...r, content: variation, landed: true }))
      if (!muted) playLand()
    } else {
      if (!muted) playShuffle(TIMELINE.shuffle)
      timers.push(
        setTimeout(() => setPhase('reveal'), TIMELINE.shuffle),
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

  // Flip the fanned-out transform on a tick after the side cards mount, so
  // the browser has a stacked frame to transition *from* instead of the
  // cards popping straight into their spread positions.
  useEffect(() => {
    if (phase !== 'reveal') return
    let raf1
    let raf2
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setFanned(true))
    })
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
    }
  }, [phase])

  // --- the carousel: decelerating double-flips, landing on `variation` ---
  useEffect(() => {
    if (phase !== 'reveal' || prefersReducedMotion()) return
    let timer
    const start = performance.now()

    // Each cycle is two half-turns - face to back, then back to the next
    // face - so the same per-turn pacing as before now reads as "peek at
    // the back, then a new name" instead of one name dissolving into
    // another. The two halves always add up to the same `flipMs`/`gap`
    // budget a single flip used to take, so the overall deceleration
    // curve and total reveal duration are unchanged.
    const cycle = () => {
      const elapsed = performance.now() - start
      const progress = Math.min(1, elapsed / TIMELINE.reveal)
      // TEMP: scaled up (roughly 2x) alongside TIMELINE.reveal for
      // on-device diagnosis of the mobile backface-visibility flash -
      // revert alongside timing.js once confirmed fixed.
      const gap = 180 + 620 * progress ** 2.4
      const flipMs = Math.max(180, Math.min(520, gap * 0.55))
      const isFinal = progress >= 1
      const halfMs = flipMs / 2

      // Half-turn one: face -> back.
      if (!muted) playFlip()
      setReveal((r) => ({ ...r, rotation: r.rotation + 180, flipMs: halfMs }))

      timer = setTimeout(() => {
        // Half-turn two: back -> face, loaded with the next name (or the
        // real winner on the final turn) while it was turned away.
        if (!muted) playFlip()
        setReveal((r) => {
          const nextStep = r.step + 1
          return {
            ...r,
            rotation: r.rotation + 180,
            step: nextStep,
            content: isFinal ? variation : pool[nextStep % pool.length],
            flipMs: halfMs,
            landed: isFinal,
          }
        })

        if (isFinal) {
          if (!muted) playLand()
          return
        }
        timer = setTimeout(cycle, Math.max(0, gap - flipMs))
      }, halfMs)
    }

    timer = setTimeout(cycle, 90)
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
          <div className="fan">
            {FAN.filter((i) => i !== HERO).map((i) => {
              const offset = i - HERO
              return (
                <div
                  className="fan__slot fan__slot--side"
                  key={i}
                  style={{
                    transform: fanTransform(offset, fanned, reveal.landed),
                    opacity: reveal.landed ? 0 : 1,
                    transition: FAN_TRANSITION,
                  }}
                >
                  <div
                    className={`fan__bob ${!reveal.landed ? 'fan__bob--active' : ''}`}
                    style={{ animationDelay: `${Math.abs(offset) * 110}ms` }}
                  >
                    <CardBack />
                  </div>
                </div>
              )
            })}

            <div className="fan__slot fan__slot--hero">
              <div
                className={`reveal__glow ${
                  reveal.landed ? 'reveal__glow--pulse' : ''
                }`}
                aria-hidden="true"
              />
              <motion.div
                className="reveal__flipper"
                style={{ rotateY }}
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
                <motion.div
                  className="reveal__face reveal__face--a"
                  style={{ visibility: faceAVisibility }}
                >
                  <CardFace variation={reveal.content} shimmer={reveal.landed} />
                </motion.div>
                <motion.div
                  className="reveal__face reveal__face--b"
                  style={{ visibility: faceBVisibility }}
                >
                  <CardBack />
                </motion.div>
              </motion.div>
            </div>
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
