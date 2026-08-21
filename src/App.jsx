import { useState } from 'react'
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
 *   result --☰ House------>  overlay: 'house'  --close-->  result
 *
 * The winning variation is chosen the moment you tap, before the
 * carousel starts, so it can land on it. Mixing itself is left out of
 * the crossfade group below - it's already a themed full animation,
 * so it just mounts/unmounts directly.
 */
export default function App() {
  const [stage, setStage] = useState('home')
  const [current, setCurrent] = useState(null)
  const [overlay, setOverlay] = useState(null) // null | 'rules' | 'house'
  const [muted, toggleMuted] = useMuted()
  const enterImmersive = useImmersive()

  const showChrome = stage !== 'mixing' && !overlay
  // The header (wordmark + mute) is identical on every stage, including
  // Mixing - it only steps aside for the rule sheets, which cover the
  // whole screen anyway.
  const showHeader = !overlay
  const showCredit = !overlay

  const startMix = () => {
    // Fullscreen + wake lock only succeed inside a user gesture, so
    // this has to run synchronously at the top of the click handler.
    enterImmersive()
    setOverlay(null)
    // Never the same twist twice in a row.
    setCurrent(pickNext(variations, current?.id))
    setStage('mixing')
  }

  return (
    <div className="shell">
      {showChrome && <FloatingSuits />}
      {showHeader && (
        <Header muted={muted} onToggleMute={toggleMuted} />
      )}

      <div className="stageArea">
        <AnimatePresence mode="wait">
          {stage === 'home' && (
            <motion.div key="home" {...FADE}>
              <Home onMix={startMix} />
            </motion.div>
          )}

          {stage === 'result' && (
            <motion.div key="result" {...FADE}>
              <Result
                variation={current}
                onMixAgain={startMix}
                onShowRules={() => setOverlay('rules')}
                onHouseRules={() => setOverlay('house')}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {stage === 'mixing' && (
          <Mixing
            // Remounting per variation resets the animation cleanly.
            key={current.id}
            variation={current}
            variations={variations}
            muted={muted}
            onFinish={() => setStage('result')}
          />
        )}
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
