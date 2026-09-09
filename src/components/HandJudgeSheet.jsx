import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { hasDuplicateCard, judgeHandJudge, nextEmptySlot } from '../lib/judge/handJudge.js'
import { playLand } from '../lib/sound'
import { PlayingCard } from './PlayingCard'
import './Sheet.css'

const EMPTY_HAND = [null, null, null]

const RANKS_NUMERIC = ['2', '3', '4', '5', '6', '7', '8', '9', '10']
const RANKS_FACE = ['J', 'Q', 'K', 'A']
const SUITS = ['S', 'H', 'D', 'C']
const SUIT_GLYPH = { S: '♠', H: '♥', D: '♦', C: '♣' }
const RED_SUITS = new Set(['H', 'D'])

const SLIDE = {
  initial: { y: '100%' },
  animate: { y: 0, transition: { duration: 0.26, ease: [0.3, 0.85, 0.35, 1] } },
  exit: { y: '100%', transition: { duration: 0.2, ease: 'easeIn' } },
}

const DRAWER_SLIDE = {
  initial: { y: '100%' },
  animate: { y: 0, transition: { duration: 0.22, ease: [0.3, 0.85, 0.35, 1] } },
  exit: { y: '100%', transition: { duration: 0.18, ease: 'easeIn' } },
}

function cardsEqual(a, b) {
  return a.rank === b.rank && a.suit === b.suit
}

/**
 * Stage 8 - settle a dispute over who actually won a hand. Two
 * universal controls, not a 27-variation picker (see the plan's
 * "Accepted tradeoffs"): a Normal/Muflis win-direction switch, and a
 * per-card Joker tag available on any of the 6 slots. The synthesized
 * `variation` below leans on `jokers.js`'s existing `multiRank` source -
 * tag one card and every card of that rank, in either hand, is wild -
 * so no engine change was needed for this to work.
 *
 * One screen, no wizard: Hand 1 on top, Hand 2 on the bottom, the mode
 * switch and Judge button in between. Judging swaps this same body for
 * the verdict in place, rather than opening a second screen.
 */
export function HandJudgeSheet({ onClose }) {
  const [mode, setMode] = useState('normal')
  const [hand1, setHand1] = useState(EMPTY_HAND)
  const [hand2, setHand2] = useState(EMPTY_HAND)
  const [drawer, setDrawer] = useState(null)
  const [result, setResult] = useState(null)

  const openSlot = (handNum, index) => {
    const hand = handNum === 1 ? hand1 : hand2
    const existing = hand[index]
    setDrawer({
      hand: handNum,
      index,
      step: 'rank',
      rank: existing?.rank ?? null,
      suit: existing?.suit ?? null,
    })
  }

  const pickRank = (rank) => setDrawer((d) => ({ ...d, rank, step: 'suit' }))
  const pickSuit = (suit) => setDrawer((d) => ({ ...d, suit, step: 'joker' }))

  const commitSlot = (isJoker) => {
    const { hand: handNum, index, rank, suit } = drawer
    const card = { rank, suit, joker: isJoker }
    const currentHand = handNum === 1 ? hand1 : hand2
    const nextHand = currentHand.map((c, i) => (i === index ? card : c))
    if (handNum === 1) setHand1(nextHand)
    else setHand2(nextHand)

    const h1 = handNum === 1 ? nextHand : hand1
    const h2 = handNum === 2 ? nextHand : hand2
    const next = nextEmptySlot(handNum, index, h1, h2)
    if (!next) {
      setDrawer(null)
      return
    }
    const hand = next.hand === 1 ? h1 : h2
    const existing = hand[next.index]
    setDrawer({
      hand: next.hand,
      index: next.index,
      step: 'rank',
      rank: existing?.rank ?? null,
      suit: existing?.suit ?? null,
    })
  }

  const canJudge = hand1.every(Boolean) && hand2.every(Boolean)
  const hasDuplicate = hasDuplicateCard(hand1, hand2)

  const handleJudge = () => {
    setResult(judgeHandJudge({ hand1, hand2, mode }))
    // Same reveal cue Mixing.jsx plays when a mix lands - this is the
    // same kind of moment (an answer becoming visible), so it reuses
    // the identity rather than inventing a second "reveal" sound.
    playLand()
  }

  const handleReset = () => {
    setHand1(EMPTY_HAND)
    setHand2(EMPTY_HAND)
    setResult(null)
    setDrawer(null)
  }

  return (
    <motion.div className="sheet" variants={SLIDE} initial="initial" animate="animate" exit="exit">
      <div className="sheet__head">
        <h2 className="sheet__title">Compare hands</h2>
        <button type="button" className="sheet__close" onClick={onClose} aria-label="Close hand judge">
          ×
        </button>
      </div>

      {!result ? (
        <div className="sheet__body handJudgeSheet__body">
          <HandRow
            label="Hand 1"
            cards={hand1}
            activeIndex={drawer?.hand === 1 ? drawer.index : null}
            onSlotTap={(i) => openSlot(1, i)}
          />

          <div className="handJudgeSheet__midZone">
            <div className="handJudgeSheet__switch" role="group" aria-label="Win direction">
              <button
                type="button"
                className={`handJudgeSheet__switchOpt${mode === 'normal' ? ' handJudgeSheet__switchOpt--active' : ''}`}
                aria-pressed={mode === 'normal'}
                onClick={() => setMode('normal')}
              >
                Normal
              </button>
              <button
                type="button"
                className={`handJudgeSheet__switchOpt${mode === 'muflis' ? ' handJudgeSheet__switchOpt--active' : ''}`}
                aria-pressed={mode === 'muflis'}
                onClick={() => setMode('muflis')}
              >
                Muflis
              </button>
            </div>
            <div className="handJudgeSheet__judgeRow">
              <div className="handJudgeSheet__judgeLine" aria-hidden="true" />
              <button
                type="button"
                className="handJudgeSheet__judgeBtn"
                disabled={!canJudge}
                onClick={handleJudge}
              >
                Judge
              </button>
            </div>
            {hasDuplicate && (
              <p className="handJudgeSheet__warning">Same card entered twice - double-check before judging.</p>
            )}
          </div>

          <HandRow
            label="Hand 2"
            cards={hand2}
            activeIndex={drawer?.hand === 2 ? drawer.index : null}
            onSlotTap={(i) => openSlot(2, i)}
          />
        </div>
      ) : (
        <VerdictBody result={result} hand1={hand1} hand2={hand2} onClose={onClose} onReset={handleReset} />
      )}

      <AnimatePresence>
        {drawer && (
          <CardDrawer
            drawer={drawer}
            onPickRank={pickRank}
            onPickSuit={pickSuit}
            onPickJoker={commitSlot}
            onDismiss={() => setDrawer(null)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function HandRow({ label, cards, activeIndex, onSlotTap }) {
  return (
    <div className="handJudgeSheet__handBlock">
      <div className="handJudgeSheet__handLabel">{label}</div>
      <div className="handJudgeSheet__handRow">
        {cards.map((card, i) => (
          <PlayingCard key={i} card={card} active={activeIndex === i} onClick={() => onSlotTap(i)} />
        ))}
      </div>
    </div>
  )
}

function CardDrawer({ drawer, onPickRank, onPickSuit, onPickJoker, onDismiss }) {
  return (
    <>
      <div
        className="handJudgeSheet__dim"
        onClick={onDismiss}
        role="button"
        tabIndex={0}
        aria-label="Dismiss"
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') onDismiss()
        }}
      />
      <motion.div
        className="handJudgeSheet__drawer"
        variants={DRAWER_SLIDE}
        initial="initial"
        animate="animate"
        exit="exit"
      >
        {drawer.step === 'rank' && (
          <>
            <div className="handJudgeSheet__drawerTitle">Pick a rank</div>
            <div className="handJudgeSheet__rankGrid">
              {RANKS_NUMERIC.map((r) => (
                <button
                  key={r}
                  type="button"
                  className={`handJudgeSheet__rankChip${drawer.rank === r ? ' handJudgeSheet__rankChip--active' : ''}`}
                  onClick={() => onPickRank(r)}
                >
                  {r}
                </button>
              ))}
            </div>
            <div className="handJudgeSheet__faceNote">special cards</div>
            <div className="handJudgeSheet__faceRow">
              {RANKS_FACE.map((r) => (
                <button
                  key={r}
                  type="button"
                  className={`handJudgeSheet__faceChip${drawer.rank === r ? ' handJudgeSheet__faceChip--active' : ''}`}
                  onClick={() => onPickRank(r)}
                >
                  {r}
                </button>
              ))}
            </div>
          </>
        )}

        {drawer.step === 'suit' && (
          <>
            <div className="handJudgeSheet__drawerTitle">{drawer.rank} of&hellip; pick a suit</div>
            <div className="handJudgeSheet__suitRow">
              {SUITS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`handJudgeSheet__suitChip handJudgeSheet__suitChip--${RED_SUITS.has(s) ? 'red' : 'black'}${drawer.suit === s ? ' handJudgeSheet__suitChip--active' : ''}`}
                  onClick={() => onPickSuit(s)}
                  aria-label={s}
                >
                  {SUIT_GLYPH[s]}
                </button>
              ))}
            </div>
          </>
        )}

        {drawer.step === 'joker' && (
          <>
            <div className="handJudgeSheet__drawerTitle">One more thing</div>
            <p className="handJudgeSheet__drawerSub">
              Is <strong>{drawer.rank}{SUIT_GLYPH[drawer.suit]}</strong> the joker?
            </p>
            <div className="handJudgeSheet__tagRow">
              <button type="button" className="handJudgeSheet__tagBtn" onClick={() => onPickJoker(false)}>
                Normal
              </button>
              <button type="button" className="handJudgeSheet__tagBtn" onClick={() => onPickJoker(true)}>
                ★ Joker
              </button>
            </div>
          </>
        )}
      </motion.div>
    </>
  )
}

function VerdictBody({ result, hand1, hand2, onClose, onReset }) {
  const [r1, r2] = result.hands
  const winnerText =
    result.winner == null ? "It's a tie" : `Hand ${result.winner} wins`

  return (
    <div className="sheet__body handJudgeSheet__body handJudgeSheet__body--verdict">
      <VerdictHand num={1} cards={hand1} handResult={r1} winning={result.winner === 1} position="top" />

      <div className="handJudgeSheet__midZone">
        <div className="handJudgeSheet__winnerEyebrow">Verdict</div>
        <div className="handJudgeSheet__winner">{winnerText}</div>
        <div className="handJudgeSheet__midButtons">
          <button type="button" className="btn btn--ghost handJudgeSheet__midBtn" onClick={onClose}>
            Close
          </button>
          <button type="button" className="btn btn--gold handJudgeSheet__midBtn" onClick={onReset}>
            Judge another
          </button>
        </div>
      </div>

      <VerdictHand num={2} cards={hand2} handResult={r2} winning={result.winner === 2} position="bottom" />
    </div>
  )
}

function VerdictHand({ num, cards, handResult, winning, position }) {
  const converted =
    handResult.jokersUsed > 0
      ? cards.map((c, i) => {
          const resolved = { rank: handResult.reading.ranks[i], suit: handResult.reading.suits[i] }
          return { ...resolved, changed: !cardsEqual(c, resolved) }
        })
      : null

  const enteredRow = (
    <div className={`handJudgeSheet__handRow${winning ? ' handJudgeSheet__handRow--win' : ''}`}>
      {cards.map((c, i) => (
        <PlayingCard key={i} card={c} tag={c.joker ? '★ Joker' : null} />
      ))}
    </div>
  )

  const convertedRow = converted && (
    <>
      <div className="handJudgeSheet__convertedLabel">best hand using the joker</div>
      <div className="handJudgeSheet__convertedRow">
        {converted.map((c, i) => (
          <PlayingCard key={i} card={c} size="mini" changed={c.changed} />
        ))}
      </div>
    </>
  )

  const label = (
    <div className="handJudgeSheet__handLabel">
      {winning && (
        <span className="handJudgeSheet__crown" aria-hidden="true">
          👑
        </span>
      )}
      {' '}Hand {num} &mdash; {handResult.label}
    </div>
  )

  if (position === 'bottom') {
    return (
      <div className="handJudgeSheet__handBlock">
        {convertedRow}
        {label}
        {enteredRow}
      </div>
    )
  }

  return (
    <div className="handJudgeSheet__handBlock">
      {label}
      {enteredRow}
      {convertedRow}
    </div>
  )
}
