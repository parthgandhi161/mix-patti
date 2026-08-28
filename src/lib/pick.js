import { getStorageJSON, setStorageJSON } from './storage'

const STATE_KEY = 'mixpatti.pickState'

// Bag A (priority 1, the classics) is drawn a fifth of the time; bag B
// (priority 2, the "fun" twists) the rest. Two independent shuffle-bags -
// each cycles through every one of its own members before repeating any -
// rather than one shared pool, so the classics stay a rare treat instead of
// drowning in the larger set.
const BAG_A_SHARE = 0.2

// Target share of ROUNDS (not entries) that land "sideshow banned".
// variations.json marks a couple of entries sideshowBanned: true because the
// mechanic makes a sideshow nonsensical - non-negotiable. Everything else
// gets an extra per-round coin flip so the two sources add up to ~20%; see
// bannedRollRate() for the derivation.
const TARGET_BANNED_SHARE = 0.2

// A reroll only fires when this round's pick is banned AND last round's was
// too. Capped so a pathological data change (e.g. a bag mostly
// sideshowBanned) can't recurse away; if every attempt comes up banned, the
// last one is just accepted - best-effort, not a hard guarantee.
const MAX_REROLL_ATTEMPTS = 4

/**
 * Non-strict rate needed on the remaining entries so the strict-banned
 * share plus this extra roll converge on TARGET_BANNED_SHARE, derived from
 * the live dataset every call rather than hardcoded - this repo has a
 * documented history of stale hardcoded counts (see git log "Fix stale
 * 20-variation references after content update").
 *
 *   strictShare + eligibleShare * rate = TARGET_BANNED_SHARE
 */
export function bannedRollRate(variations) {
  const total = variations.length
  if (total === 0) return 0
  const strict = variations.filter((v) => v.sideshowBanned === true).length
  const eligible = total - strict
  if (eligible <= 0) return 0
  const shortfall = Math.max(0, TARGET_BANNED_SHARE - strict / total)
  return Math.min(1, (shortfall * total) / eligible)
}

/** True if `a` and `b` contain exactly the same ids, order ignored. */
function sameIdSet(a, b) {
  if (!Array.isArray(a) || a.length !== b.length) return false
  const set = new Set(a)
  return b.every((id) => set.has(id))
}

/**
 * A persisted bag's `remaining` pool only means anything relative to the
 * exact set of ids it was shuffled from. If variations.json has since
 * added, removed, or re-prioritised anything, that set no longer matches
 * bagSourceIds - and a stale pool can't tell "this id is brand new" apart
 * from "this id was already drawn earlier this cycle", since both are
 * simply absent from `remaining`. Rather than leave newly-added
 * variations unreachable until whatever partial cycle happens to be
 * mid-flight empties out on its own (worst case: a full bag's worth of
 * picks), treat any source-set mismatch as a reason to drop that bag and
 * reshuffle fresh from the current data on the very next draw - see
 * drawFrom()'s empty-pool path. Persisting the source sets alongside the
 * pools (writeState) is what makes this comparison possible at all.
 */
function readState(bagSourceIds) {
  // `stored` fails this check (falls through to a fresh cycle below) for
  // anything that isn't a plain object - including `null` (nothing
  // persisted, or getStorageJSON swallowed a corrupt/unavailable read)
  // and a bare array (the old mixpatti.unseenIds single-array shape,
  // which has no .bagA/.bagB).
  const stored = getStorageJSON(STATE_KEY, null)
  if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
    const bagAFresh = sameIdSet(stored.bagASource, bagSourceIds.bagA)
    const bagBFresh = sameIdSet(stored.bagBSource, bagSourceIds.bagB)
    return {
      bagA: bagAFresh && Array.isArray(stored.bagA) ? stored.bagA : [],
      bagB: bagBFresh && Array.isArray(stored.bagB) ? stored.bagB : [],
      lastBanned:
        typeof stored.lastBanned === 'boolean' ? stored.lastBanned : null,
    }
  }
  return { bagA: [], bagB: [], lastBanned: null }
}

function writeState(state, bagSourceIds) {
  setStorageJSON(STATE_KEY, {
    ...state,
    bagASource: bagSourceIds.bagA,
    bagBSource: bagSourceIds.bagB,
  })
}

/**
 * Pop one id off a shuffle-bag, refilling+reshuffling from `sourceIds` when
 * it runs dry.
 *
 * A fresh shuffle can coincidentally deal the same id that just finished the
 * previous cycle right back out on top - and since a bag only ever loses the
 * id it hands out, that refill instant is the ONLY place a repeat can sneak
 * in (any id still sitting in a bag was, by definition, not the one just
 * shown). The swap below runs unconditionally rather than only at a
 * detected refill boundary: it's cheap, and it also covers a hand-edited or
 * corrupt localStorage value that puts previousId on top of an otherwise
 * mid-cycle bag.
 */
function drawFrom(remaining, sourceIds, previousId) {
  const list = remaining.length > 0 ? remaining.slice() : shuffled(sourceIds)
  const top = list.length - 1
  if (top > 0 && list[top] === previousId) {
    const j = Math.floor(Math.random() * top) // 0..top-1
    ;[list[top], list[j]] = [list[j], list[top]]
  }
  return { id: list[top], rest: list.slice(0, top) }
}

/**
 * Pick the next variation, plus whether sideshow is banned this round.
 *
 * Two independent shuffle-bags (BAG_A_SHARE) replace the old single "unseen
 * pool". `previousId` is only ever compared within the bag it belongs to,
 * since the two bags' ids never overlap (priority is treated as a strict
 * A/not-A split - anything other than exactly `1` counts as bag B, so a
 * missing/bad field degrades gracefully instead of throwing) - so "never
 * the same twist twice in a row" holds across a bag switch for free, and
 * drawFrom() enforces it within one bag.
 *
 * The sideshow-ban reroll compares EFFECTIVE (resolved) banned status, not
 * the two static `sideshowBanned` data flags - that's what the player
 * actually experiences two rounds running. Trade-off: unlike the
 * twist-repeat guarantee (structural, absolute), this is a bounded reroll,
 * so it is best-effort - with MAX_REROLL_ATTEMPTS capped, two genuinely
 * strict-banned entries CAN still land back-to-back in the unlucky case
 * where every attempt keeps re-drawing a banned entry. With only ~2 strict
 * entries in 25 and a ~20% overall banned rate, that chain is vanishingly
 * rare in practice.
 */
export function pickNext(variations, previousId) {
  const byId = new Map(variations.map((v) => [v.id, v]))
  const bagSourceIds = {
    bagA: variations.filter((v) => v.priority === 1).map((v) => v.id),
    bagB: variations.filter((v) => v.priority !== 1).map((v) => v.id),
  }
  const state = readState(bagSourceIds)
  const rollRate = bannedRollRate(variations)

  let variation
  let banned
  for (let attempt = 1; attempt <= MAX_REROLL_ATTEMPTS; attempt++) {
    const bagKey = Math.random() < BAG_A_SHARE ? 'bagA' : 'bagB'
    const sourceIds =
      bagSourceIds[bagKey].length > 0
        ? bagSourceIds[bagKey]
        : [...bagSourceIds.bagA, ...bagSourceIds.bagB] // defensive: a
          // future data edit that empties a priority group falls back to
          // the full list rather than drawing `undefined`.
    const { id, rest } = drawFrom(state[bagKey], sourceIds, previousId)
    state[bagKey] = rest

    variation = byId.get(id) ?? variations[0]
    banned = variation.sideshowBanned === true || Math.random() < rollRate

    const backToBack = banned && state.lastBanned === true
    if (!backToBack || attempt === MAX_REROLL_ATTEMPTS) break
    // Otherwise: this pick is discarded unseen. It stays popped from its
    // bag for the rest of this cycle (resurfaces at the next reshuffle of
    // that bag) - loop for a fresh draw from a freshly-chosen bag.
  }

  state.lastBanned = banned
  writeState(state, bagSourceIds)

  return { variation, sideshowBannedThisRound: banned }
}

/** A shuffled copy - used to feed random names to the spin animation. */
export function shuffled(items) {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}
