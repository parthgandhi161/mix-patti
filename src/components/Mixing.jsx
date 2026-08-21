import { useEffect, useRef, useState } from 'react'
import { animate, motion, useMotionValue, useTransform } from 'framer-motion'
import { CardBack, CardFace } from './Card'
import { TIMELINE, prefersReducedMotion } from '../lib/timing'
import { playShuffle, playFlip, playLand, stopAll } from '../lib/sound'
import { shuffled } from '../lib/pick'
import './Mixing.css'

const DECK = [0, 1, 2, 3, 4]

/* --- the carousel -------------------------------------------------- */

// strip[0]. Renders a card back rather than a face, so the carousel
// starts out looking exactly like the settled deck it replaces.
const BACK = null
const TRAVEL = 19 // decoys that pass through the centre before the winner
const TRAIL = 2 // decoys parked past it, so the overshoot shows real cards
const WIN_INDEX = 1 + TRAVEL // strip[WIN_INDEX] === variation; +1 for BACK
const OVERSHOOT = 0.28 // cards past the detent before the reel pulls back
const SETTLE_AT = 0.88 // fraction of TIMELINE.reveal spent gliding
const ENTER_MS = 260 // side cards fading in at the handoff
const WINDOW = 2 // cards mounted either side of centre
// Spacing wide enough that two cards never overlap, even at the worst
// phase (pos exactly halfway between them, where each is scaled to 0.88
// and they clear each other by ~9px). Card art is opaque, so any overlap
// during the fast pass reads as two half-visible cards fighting rather
// than one card in front of another.
const STEP = 92 // card-to-card spacing, as a % of one card's own width
const SCALE_FALLOFF = 0.78 // scale multiplier per card away from centre
const FADE_FALLOFF = 0.55 // opacity multiplier per card past the plateau
const SOLID = 0.5 // |d| within this stays fully opaque - see fade()
const TICK_MIN_MS = 40 // audio tick debounce, see the subscriber below

/** Gets the reel off the mark. GLIDE alone would start at full speed. */
const ACCEL = (u) => u ** 1.6
/** Slot-reel deceleration: opens at 2.5x the mean rate, long flat tail. */
const GLIDE = (u) => 1 - (1 - u) ** 2.5
/** The pull-back off the overshoot: moves, then arrives dead still. */
const SETTLE = (u) => 1 - (1 - u) ** 2

/**
 * Opacity by distance from centre, with a flat top.
 *
 * `pos` is fractional, so the card in the slot is almost never at
 * exactly d=0 - a bare falloff curve would leave it permanently
 * semi-transparent and let the cards behind bleed through it. The
 * plateau keeps whichever card currently owns the slot fully solid.
 */
function fade(d) {
  const a = Math.abs(d)
  return a <= SOLID ? 1 : FADE_FALLOFF ** (a - SOLID)
}

/**
 * One card on the travelling strip.
 *
 * Extracted rather than inlined into the .map() because each card needs
 * its own useTransform hooks, and hooks can't be called in a loop body.
 * Everything positional runs on motion values, so a moving card never
 * re-renders - React only decides *which* cards are mounted.
 *
 * Two nested elements on purpose: the outer slot carries the travel
 * transform and the one-shot fade-out on landing (a plain CSS
 * transition), the inner carries the distance-based opacity (a motion
 * value). Putting both opacities on one element would mean the landing
 * fade and the per-frame falloff fighting over the same property.
 */
function CarouselCard({ index, pos, variation, isWinner, dimmed, fadeIn, depth }) {
  const x = useTransform(pos, (p) => `${(index - p) * STEP}%`)
  const scale = useTransform(pos, (p) => SCALE_FALLOFF ** Math.abs(index - p))
  const opacity = useTransform(pos, (p) => fade(index - p))

  return (
    <motion.div
      className={`carousel__slot${dimmed ? ' carousel__slot--dimmed' : ''}${
        fadeIn ? ' carousel__slot--in' : ''
      }`}
      style={{ x, scale, zIndex: 20 - depth * 2 }}
    >
      <motion.div
        className={`carousel__card${isWinner ? ' carousel__card--landed' : ''}`}
        style={{ opacity }}
      >
        {isWinner && (
          <div className="reveal__glow reveal__glow--pulse" aria-hidden="true" />
        )}
        {variation === BACK ? (
          <CardBack />
        ) : (
          <CardFace variation={variation} shimmer={isWinner} />
        )}
      </motion.div>
    </motion.div>
  )
}

/**
 * Stage 2 - the mix. Two phases (durations from `TIMELINE`, see timing.js):
 *
 *   shuffle  a riffling face-down deck                    "mixing"
 *   reveal   real card faces sliding through the centre,  "choosing"
 *            decelerating, landing on the winner
 *
 * The winning variation is decided by the parent *before* this mounts,
 * so the carousel is pure theatre - it always lands on `variation`.
 * Tapping anywhere skips straight to the result.
 *
 * The reveal is deliberately 2D: cards travel horizontally and scale
 * down as they move away from centre. An earlier version flipped a card
 * in 3D, which mobile WebKit renders wrong (it drops
 * `backface-visibility: hidden` once the rotating parent's transform is
 * a JS-driven matrix3d, ghosting the away-facing card through) and which
 * spends much of each turn edge-on and unreadable at phone width. Don't
 * reintroduce perspective / preserve-3d / rotateY here.
 *
 * That version also fanned four face-down cards out around the hero.
 * The carousel's own neighbours already frame the centre card, so the
 * fan just added a second row of cards competing with it - it's gone.
 */
export function Mixing({ variation, variations, onFinish }) {
  // Read once, so both effects below agree even if the OS setting flips
  // mid-mix.
  const [reduced] = useState(prefersReducedMotion)
  const [phase, setPhase] = useState(reduced ? 'reveal' : 'shuffle')
  const [landed, setLanded] = useState(reduced)
  // True for the first moments of the reveal, while the side cards fade
  // in around the back card that stood in for the deck.
  const [entering, setEntering] = useState(false)
  const done = useRef(false)

  // The strip the carousel travels along. It opens with a card back, so
  // at pos 0 the carousel is indistinguishable from the settled deck it
  // replaces - the phase swap changes nothing on screen, and the reveal
  // then deals that back away as the first face arrives. TRAVEL uses
  // every decoy exactly once; the only repeats are the trailing pair,
  // which were last centred seconds earlier at peak speed. Wrap-safe so
  // variations.json can grow or shrink without this going out of bounds.
  const [strip] = useState(() => {
    const pool = shuffled(variations.filter((v) => v.id !== variation.id))
    return [
      BACK,
      ...Array.from({ length: TRAVEL }, (_, i) => pool[i % pool.length]),
      variation,
      ...Array.from({ length: TRAIL }, (_, i) => pool[(TRAVEL + i) % pool.length]),
    ]
  })

  // Fractional position along the strip. One motion value drives the whole
  // reveal - there is no timer chain, so the deceleration is a property of
  // the easing curve and can't stutter or drift.
  const pos = useMotionValue(reduced ? WIN_INDEX : 0)
  const [centre, setCentre] = useState(reduced ? WIN_INDEX : 0)

  const finish = () => {
    if (done.current) return
    done.current = true
    onFinish()
  }

  // --- which cards are mounted ---------------------------------------
  // Math.round, not floor: it makes the mounted window symmetric around
  // the nearest card, which is what guarantees every card mounts while
  // still >= 2.5 steps out (i.e. entirely outside the clip), and makes
  // |i - centre| an exact rank ordering for z-index.
  useEffect(
    () =>
      pos.on('change', (p) => {
        const next = Math.round(p)
        setCentre((c) => (c === next ? c : next))
      }),
    [pos],
  )

  // --- phase clock ---------------------------------------------------
  useEffect(() => {
    if (reduced) {
      // Keep the reveal, drop the theatre. `landed` is already true, which
      // triggers the "hold briefly" effect below, which calls finish().
      playLand()
      return
    }

    playShuffle(TIMELINE.shuffle)
    const t = setTimeout(() => setPhase('reveal'), TIMELINE.shuffle)
    return () => {
      clearTimeout(t)
      if (!done.current) stopAll()
    }
    // Runs once per mix.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // --- the reveal: one tween, landing exactly on the winner -----------
  useEffect(() => {
    if (phase !== 'reveal' || reduced) return

    // Ticks are driven by the animation rather than a parallel timer, so
    // sound can never run ahead of what's on screen.
    let lastTick = 0
    let lastTickAt = 0
    const unTick = pos.on('change', (p) => {
      // floor, not round: a tick belongs on the moment `pos` crosses an
      // integer, while the mounted window flips on the half-integer.
      const idx = Math.floor(p)
      if (idx <= lastTick) return // monotone - the settle-back never re-ticks
      lastTick = idx // advance before the debounce, so a suppressed
      const now = performance.now() // tick is dropped rather than queued
      // A backgrounded tab freezes rAF, and Framer computes tween progress
      // from an absolute timestamp - so the first frame back can jump
      // `pos` most of the way to the end in one event. Never fire a burst.
      if (now - lastTickAt < TICK_MIN_MS) return
      lastTickAt = now
      playFlip()
    })

    // Three segments: get off the mark, glide, settle. The first exists
    // only so the reel doesn't leap from a standstill to full speed the
    // instant the deck hands over - it carries the stand-in back card
    // off to the left as the first real face arrives.
    const controls = animate(pos, [0, 0.9, WIN_INDEX + OVERSHOOT, WIN_INDEX], {
      duration: TIMELINE.reveal / 1000,
      times: [0, 0.055, SETTLE_AT, 1],
      ease: [ACCEL, GLIDE, SETTLE],
      onComplete: () => {
        setLanded(true)
        playLand()
      },
    })

    // Must come off again: the fade-in uses fill-mode both, which would
    // otherwise pin opacity at 1 and defeat the landing dim-out.
    setEntering(true)
    const t = setTimeout(() => setEntering(false), ENTER_MS)

    return () => {
      clearTimeout(t)
      unTick()
      controls.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  // Hold briefly on the landing flourish before handing off to Result.
  useEffect(() => {
    if (!landed) return
    const t = setTimeout(finish, 420)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [landed])

  const handleSkip = () => {
    if (done.current) return
    stopAll()
    playLand()
    finish()
  }

  const first = Math.max(0, centre - WINDOW)
  const last = Math.min(strip.length - 1, centre + WINDOW)
  const visible = []
  for (let i = first; i <= last; i++) visible.push(i)

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
      <div className="stage__card">
        <div className="mixing__well">
          {phase === 'shuffle' && (
            <div className="deck">
              {DECK.map((i) => (
                <div
                  className="deck__slot"
                  key={i}
                  // 60ms, not 85: with the 640ms cut this settles the last
                  // card at 880ms, leaving a clear still beat before the
                  // carousel takes over at 1000. At 85 it landed at 980 and
                  // the handoff caught the tail of the animation.
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <CardBack />
                </div>
              ))}
            </div>
          )}

          {phase === 'reveal' && (
            /* Decorative: Result announces the outcome via aria-live. */
            <div className="carousel" aria-hidden="true">
              {visible.map((i) => (
                <CarouselCard
                  key={i}
                  index={i}
                  pos={pos}
                  variation={strip[i]}
                  isWinner={landed && i === WIN_INDEX}
                  dimmed={landed && i !== WIN_INDEX}
                  // Not index 0 - that one is standing in for the deck
                  // and has to stay put, or the handoff flickers.
                  fadeIn={entering && i !== 0}
                  depth={Math.abs(i - centre)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="stage__under">
        <p className="mixing__status">
          {phase === 'shuffle' && 'mixing'}
          {phase === 'reveal' && !landed && 'choosing'}
        </p>
      </div>

      <div className="stage__foot">
        <p className="mixing__skip">tap to skip</p>
      </div>
    </div>
  )
}
