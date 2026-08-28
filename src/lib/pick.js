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

// Starred twists get a flat boost independent of how many are starred -
// same fixed-fraction design as BAG_A_SHARE, so starring one twist vs five
// changes which starred twist comes up, not how often "some starred twist"
// does. Rolled as a PRE-roll ahead of the bagA/bagB choice below, not a
// third slice of that split - a miss falls through to the bagA/bagB roll
// exactly as it ran before starring existed, so starring something can't
// dilute the classics/fun-twist ratio.
const STARRED_SHARE = 0.3

// Below this many unmuted variations, honoring the mute set at all would
// starve drawFrom() down toward the empty-pool case (see the [...bagA,
// ...bagB] fallback in pickNext()) - so it's ignored outright instead, not
// partially. useVariationPrefs.js imports this same constant so the UI can
// grey out the mute control at the identical floor before this backstop
// ever needs to fire.
export const MIN_UNMUTED = 2

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
 * If honoring `mutedIds` would leave fewer than MIN_UNMUTED variations to
 * draw from, ignore it ENTIRELY for this call rather than partially - a
 * pure pick.js-side backstop that can't be bypassed by stale/corrupt
 * persisted state (e.g. a mute list saved against a larger
 * variations.json). useVariationPrefs.js's canToggleMute() already keeps
 * the UI from getting here in normal use by graying out the mute control
 * at this same floor, so this path is defense in depth, not the primary
 * guard.
 */
function effectiveMutedSet(variations, mutedIds) {
  const muted = new Set(mutedIds)
  const unmutedCount = variations.reduce((n, v) => n + (muted.has(v.id) ? 0 : 1), 0)
  return unmutedCount >= MIN_UNMUTED ? muted : new Set()
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
    const bagStarFresh = sameIdSet(stored.bagStarSource, bagSourceIds.bagStar)
    return {
      bagA: bagAFresh && Array.isArray(stored.bagA) ? stored.bagA : [],
      bagB: bagBFresh && Array.isArray(stored.bagB) ? stored.bagB : [],
      bagStar: bagStarFresh && Array.isArray(stored.bagStar) ? stored.bagStar : [],
      lastBanned:
        typeof stored.lastBanned === 'boolean' ? stored.lastBanned : null,
    }
  }
  return { bagA: [], bagB: [], bagStar: [], lastBanned: null }
}

function writeState(state, bagSourceIds) {
  setStorageJSON(STATE_KEY, {
    ...state,
    bagASource: bagSourceIds.bagA,
    bagBSource: bagSourceIds.bagB,
    bagStarSource: bagSourceIds.bagStar,
  })
}

/**
 * Pop one id off a shuffle-bag, refilling+reshuffling from `sourceIds` when
 * it runs dry OR when the only id left would just hand `previousId` right
 * back (see below).
 *
 * A fresh shuffle can coincidentally deal the same id that just finished the
 * previous cycle right back out on top - and since a bag only ever loses the
 * id it hands out, that refill instant is the ONLY place a repeat can sneak
 * in FOR A BAG TRACKED IN ISOLATION (any id still sitting in a bag was, by
 * definition, not the one *this bag* just handed out). That reasoning holds
 * for bagA/bagB, which are disjoint by construction - but pickNext()'s
 * starred bag deliberately OVERLAPS both of them, so `previousId` CAN be
 * sitting un-drawn in the starred bag's own pool even though it was shown
 * via bagA or bagB last round. If the starred bag happens to be down to
 * exactly that one id, the `top > 0` swap guard below has nothing to swap
 * with and would otherwise repeat it. Treating "one id left, and it's
 * previousId" the same as "no ids left" closes that: a fresh reshuffle of
 * `sourceIds` always has an alternative, PROVIDED sourceIds itself has at
 * least 2 members - which is exactly why pickNext() only ever calls this
 * for the starred bag when starEligible (see there). This is a no-op for
 * bagA/bagB in real play (their sizes never realistically drain to exactly
 * previousId mid-cycle), but is left generic here rather than starred-bag-
 * specific: drawFrom() has no idea which bag it's serving, by design, and a
 * shared, simple implementation is worth more than a special case.
 *
 * The swap itself still runs unconditionally rather than only at a
 * detected refill boundary: it's cheap, and it also covers a hand-edited or
 * corrupt localStorage value that puts previousId on top of an otherwise
 * mid-cycle bag.
 */
function drawFrom(remaining, sourceIds, previousId) {
  const exhausted =
    remaining.length === 0 || (remaining.length === 1 && remaining[0] === previousId)
  const list = exhausted ? shuffled(sourceIds) : remaining.slice()
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
 * Three shuffle-bags feed the draw: bagA (priority 1) and bagB (everything
 * else, BAG_A_SHARE) stay mutually exclusive by construction (priority is a
 * strict A/not-A split - anything other than exactly `1` counts as bag B,
 * so a missing/bad field degrades gracefully instead of throwing), plus
 * bagStar - a pre-roll pool of starred ids (STARRED_SHARE), rolled BEFORE
 * the bagA/bagB choice each attempt. Unlike bagA/bagB, bagStar's ids
 * deliberately OVERLAP them: a starred priority-1 twist lives in both bagA
 * and bagStar at once, so it's reachable via either path - that's the
 * boost, not a fourth exclusive group.
 *
 * Because bagA/bagB stay disjoint, "never the same twist twice in a row"
 * still holds between just those two for free - `previousId` drawn from one
 * can never coincide with an id still sitting in the other. That reasoning
 * does NOT extend to bagStar, which can hand back an id that was just shown
 * via bagA or bagB. What actually prevents the repeat, for ANY bag, is
 * drawFrom()'s unconditional previousId-swap - and its hardening against a
 * single leftover id equalling previousId (see drawFrom()'s own comment).
 * The one gap that hardening can't close is a bag with only ONE id total -
 * nothing to ever swap to - so the starred pre-roll is skipped outright
 * (starEligible below) unless at least 2 unmuted starred ids exist. A lone
 * starred twist just never gets the boost; it's still reachable normally
 * through bagA/bagB.
 *
 * Muting: `mutedIds` are dropped from bagA/bagB/bagStar's source id lists
 * up front (see effectiveMutedSet(), which also holds the floor below which
 * muting is ignored outright), and bannedRollRate() is computed over that
 * same unmuted list so the ~20% target doesn't drift as entries get muted.
 * Changing which ids are muted OR starred changes bagSourceIds.bag* -
 * readState() compares that against the persisted bag*Source snapshots,
 * and a mismatch drops that bag and reshuffles it fresh on the very next
 * draw. This is the same mechanism that already makes a newly-added
 * variations.json entry reachable immediately; muting/starring just gives
 * the app another way to trigger it deliberately.
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
export function pickNext(variations, previousId, { mutedIds = [], starredIds = [] } = {}) {
  const byId = new Map(variations.map((v) => [v.id, v]))
  const mutedSet = effectiveMutedSet(variations, mutedIds)
  const starredSet = new Set(starredIds)
  const unmuted = variations.filter((v) => !mutedSet.has(v.id))
  const bagSourceIds = {
    bagA: unmuted.filter((v) => v.priority === 1).map((v) => v.id),
    bagB: unmuted.filter((v) => v.priority !== 1).map((v) => v.id),
    bagStar: unmuted.filter((v) => starredSet.has(v.id)).map((v) => v.id),
  }
  const starEligible = bagSourceIds.bagStar.length >= 2
  const state = readState(bagSourceIds)
  const rollRate = bannedRollRate(unmuted)

  let variation
  let banned
  for (let attempt = 1; attempt <= MAX_REROLL_ATTEMPTS; attempt++) {
    const useStarred = starEligible && Math.random() < STARRED_SHARE
    const bagKey = useStarred ? 'bagStar' : Math.random() < BAG_A_SHARE ? 'bagA' : 'bagB'
    const sourceIds =
      bagKey === 'bagStar' || bagSourceIds[bagKey].length > 0
        ? bagSourceIds[bagKey]
        : [...bagSourceIds.bagA, ...bagSourceIds.bagB] // defensive: muting
          // (or, previously, only a future data edit) emptying a priority
          // group falls back to the full unmuted list rather than drawing
          // `undefined`. Never reached for bagStar - it's only ever chosen
          // when starEligible, which guarantees it's non-empty.
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
