import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import variations from './data/variations.json'
import { Home } from './components/Home'
import { Mixing } from './components/Mixing'
import { Result } from './components/Result'
import { RulesSheet } from './components/RulesSheet'
import { HouseRulesSheet } from './components/HouseRulesSheet'
import { FloatingSuits } from './components/FloatingSuits'
import { Header } from './components/Header'
import { Credit } from './components/Brand'
import { useMuted } from './lib/useMuted'
import { useImmersive } from './lib/immersive'
import { pickNext } from './lib/pick'
import { primeAudio } from './lib/sound'

const FADE = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.22 } },
  exit: { opacity: 0, transition: { duration: 0.16 } },
}

/**
 * The whole app is a three-state machine, plus an independent overlay
 * for the two rule sheets:
 *
 *   home  --tap-->  mixing  --animation ends / skip-->  result
 *     ^                                                   |
 *     +---------------------- mix again ------------------+
 *
 *   result --Show rules-->  overlay: 'rules'  --close-->  result
 *   any stage --☰ header------>  overlay: 'house'  --close-->  result
 *
 * The winning variation is chosen the moment you tap, before the
 * carousel starts, so it can land on it. All three stages share one
 * crossfade group and one card size, so moving between them reads as a
 * single continuous card rather than three separate screens.
 */
export default function App() {
  const [stage, setStage] = useState('home')
  const [current, setCurrent] = useState(null)
  const [overlay, setOverlay] = useState(null) // null | 'rules' | 'house'
  const [muted, toggleMuted] = useMuted()
  const enterImmersive = useImmersive()

  // Mirrors .shell--dim/.appHeader--dim one level higher, on <body>
  // itself - see the .is-mixing rule in global.css for why.
  useEffect(() => {
    document.body.classList.toggle('is-mixing', stage === 'mixing')
    return () => document.body.classList.remove('is-mixing')
  }, [stage])

  const showChrome = stage !== 'mixing' && !overlay
  // The header (hamburger + wordmark + mute/fullscreen) is identical on
  // every stage, including Mixing - it only steps aside for the rule
  // sheets, which cover the whole screen anyway.
  const showHeader = !overlay
  const showCredit = !overlay

  const startMix = () => {
    // Fullscreen + wake lock + audio resume only succeed inside a user
    // gesture, so this has to run synchronously at the top of the click
    // handler - see src/lib/sound.js for why this matters for iOS.
    enterImmersive()
    primeAudio()
    setOverlay(null)
    // Never the same twist twice in a row.
    setCurrent(pickNext(variations, current?.id))
    setStage('mixing')
  }

  return (
    <div className={`shell${stage === 'mixing' ? ' shell--dim' : ''}`}>
      {/* Fades with the stage instead of vanishing on the same frame the
          dim lands - an abrupt unmount reads as a flicker. */}
      <AnimatePresence>
        {showChrome && (
          <motion.div key="suits" {...FADE}>
            <FloatingSuits />
          </motion.div>
        )}
      </AnimatePresence>
      {showHeader && (
        <Header
          stage={stage}
          muted={muted}
          onToggleMute={toggleMuted}
          onHouseRules={() => setOverlay('house')}
          dim={stage === 'mixing'}
        />
      )}

      <div className="stageArea">
        {/* No `mode="wait"`: waiting for the outgoing stage to finish
            leaves dead frames between them. Every .stage is absolutely
            positioned, so letting both mount at once simply stacks them
            and they cross-dissolve. Because the card is the same size in
            the same place on every stage, that dissolve has nothing to
            pop - the mixing stage's landed winner sits directly under
            the result card as one fades into the other. */}
        <AnimatePresence>
          {stage === 'home' && (
            <motion.div key="home" {...FADE}>
              <Home onMix={startMix} />
            </motion.div>
          )}

          {stage === 'mixing' && (
            // Keyed per variation so each mix remounts with fresh state.
            <motion.div key={`mixing-${current.id}`} {...FADE}>
              <Mixing
                variation={current}
                variations={variations}
                onFinish={() => setStage('result')}
              />
            </motion.div>
          )}

          {stage === 'result' && (
            <motion.div key="result" {...FADE}>
              <Result
                variation={current}
                onMixAgain={startMix}
                onShowRules={() => setOverlay('rules')}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {showCredit && <Credit />}

      <AnimatePresence>
        {overlay === 'rules' && (
          <RulesSheet variation={current} onClose={() => setOverlay(null)} />
        )}
        {overlay === 'house' && (
          <HouseRulesSheet onClose={() => setOverlay(null)} />
        )}
      </AnimatePresence>
    </div>
  )
}
