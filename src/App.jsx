import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import variations from './data/variations.json'
import { Home } from './components/Home'
import { Mixing } from './components/Mixing'
import { Result } from './components/Result'
import { RulesSheet } from './components/RulesSheet'
import { HouseRulesSheet } from './components/HouseRulesSheet'
import { BrowseSheet } from './components/BrowseSheet'
import { PlayersSheet } from './components/PlayersSheet'
import { FloatingSuits } from './components/FloatingSuits'
import { Header } from './components/Header'
import { Credit } from './components/Brand'
import { useMuted } from './lib/useMuted'
import { useImmersive } from './lib/immersive'
import { usePlayers } from './lib/usePlayers'
import { useVariationPrefs } from './lib/useVariationPrefs'
import { pickNext } from './lib/pick'
import { primeAudio } from './lib/sound'
import { setReloadSafe } from './lib/pwaUpdate'

const FADE = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.22 } },
  exit: { opacity: 0, transition: { duration: 0.22 } },
}

/**
 * The whole app is a three-state machine, plus an independent overlay
 * for the rule sheets:
 *
 *   home  --tap-->  mixing  --animation ends / skip-->  result
 *     ^                                                   |
 *     +---------------------- mix again ------------------+
 *
 *   result --Show rules-->  overlay: 'rules'  --close-->  result
 *   any stage --☰ header------>  overlay: 'house'  --close-->  result
 *   any stage --📖 header------>  overlay: 'browse'  --close-->  result
 *   result --dealer line / + Add players-->  overlay: 'players'  --close-->  result
 *
 * Inside 'browse', picking a row sets browseTarget (a variation) and
 * layers RulesSheet on top of the list; that sheet's own close clears
 * only browseTarget, landing back on the list instead of falling all
 * the way through to the stage underneath.
 *
 * The winning variation is chosen the moment you tap, before the
 * carousel starts, so it can land on it. All three stages share one
 * crossfade group and one card size, so moving between them reads as a
 * single continuous card rather than three separate screens.
 */
export default function App() {
  const [stage, setStage] = useState('home')
  const [current, setCurrent] = useState(null)
  const [sideshowBannedThisRound, setSideshowBannedThisRound] = useState(false)
  // Whether Result's own sideshow-ban reveal wants the header/footer
  // dimmed right now - reported up via Result's onRevealDimChange, so
  // it can share the same dim mechanism as stage === 'mixing' below
  // instead of Result inventing a second one.
  const [resultRevealDim, setResultRevealDim] = useState(false)
  const [overlay, setOverlay] = useState(null) // null | 'rules' | 'house' | 'browse' | 'players'
  const [browseTarget, setBrowseTarget] = useState(null)
  const [muted, toggleMuted] = useMuted()
  const enterImmersive = useImmersive()
  const {
    players,
    dealerIndex,
    dealerName,
    addPlayer,
    renamePlayer,
    removePlayer,
    movePlayer,
    setDealer,
    advanceDealer,
    clearPlayers,
  } = usePlayers()
  const {
    starredIds,
    mutedIds,
    isStarred,
    isMuted,
    toggleStarred,
    toggleMuted: toggleVariationMuted,
    canToggleMute,
  } = useVariationPrefs(variations)

  // Single source of truth for every chrome-dim site below - shared by
  // both the Mixing stage and Result's sideshow-ban reveal, so they
  // stay one mechanism instead of drifting into two.
  const dimChrome = stage === 'mixing' || resultRevealDim

  // Mirrors .shell--dim/.appHeader--dim one level higher, on <body>
  // itself - see the .is-dim rule in global.css for why.
  useEffect(() => {
    document.body.classList.toggle('is-dim', dimChrome)
    return () => document.body.classList.remove('is-dim')
  }, [dimChrome])

  // Tells pwaUpdate.js when it's safe to silently reload for a pending
  // app update - only the idle Home stage with no sheet open, so a
  // reload can never land mid-mix or drop an open sheet.
  useEffect(() => {
    setReloadSafe(stage === 'home' && overlay === null)
  }, [stage, overlay])

  // Excludes muted twists from the carousel's decorative spin too, not
  // just the actual draw (pick.js) - a group that muted a twist because
  // they refuse to play it shouldn't still see it flash by as a decoy.
  const mixingDecoyVariations = variations.filter((v) => !isMuted(v.id))

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
    // No-op on an empty roster. Done here, not in an effect, so
    // StrictMode's dev double-invoke of an effect can't double-advance
    // it - this click handler only runs once per real tap regardless.
    advanceDealer()
    // Never the same twist twice in a row.
    const { variation, sideshowBannedThisRound: banned } = pickNext(
      variations,
      current?.id,
      { mutedIds, starredIds },
    )
    setCurrent(variation)
    setSideshowBannedThisRound(banned)
    setStage('mixing')
  }

  return (
    <div className={`shell${dimChrome ? ' shell--dim' : ''}`}>
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
          onBrowse={() => setOverlay('browse')}
          hasPlayers={players.length > 0}
          onOpenPlayers={() => setOverlay('players')}
          dim={dimChrome}
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
              <Home onMix={startMix} variationCount={variations.length} />
            </motion.div>
          )}

          {stage === 'mixing' && (
            // Keyed per variation so each mix remounts with fresh state.
            <motion.div key={`mixing-${current.id}`} {...FADE}>
              <Mixing
                variation={current}
                variations={mixingDecoyVariations}
                onFinish={() => setStage('result')}
              />
            </motion.div>
          )}

          {stage === 'result' && (
            <motion.div key="result" {...FADE}>
              <Result
                variation={current}
                sideshowBannedThisRound={sideshowBannedThisRound}
                onMixAgain={startMix}
                onShowRules={() => setOverlay('rules')}
                dealerName={dealerName}
                onOpenPlayers={() => setOverlay('players')}
                starred={isStarred(current.id)}
                muted={isMuted(current.id)}
                onToggleStar={() => toggleStarred(current.id)}
                onToggleMute={() => toggleVariationMuted(current.id)}
                canMuteThis={canToggleMute(current.id)}
                onRevealDimChange={setResultRevealDim}
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
        {overlay === 'browse' && (
          <BrowseSheet
            variations={variations}
            browseTarget={browseTarget}
            onClose={() => setOverlay(null)}
            onSelect={setBrowseTarget}
            isStarred={isStarred}
            isMuted={isMuted}
            onToggleStar={toggleStarred}
            onToggleMute={toggleVariationMuted}
            canToggleMute={canToggleMute}
          />
        )}
        {browseTarget && (
          <RulesSheet variation={browseTarget} onClose={() => setBrowseTarget(null)} />
        )}
        {overlay === 'players' && (
          <PlayersSheet
            players={players}
            dealerIndex={dealerIndex}
            onAdd={addPlayer}
            onRename={renamePlayer}
            onRemove={removePlayer}
            onMove={movePlayer}
            onSetDealer={setDealer}
            onClear={clearPlayers}
            onClose={() => setOverlay(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
