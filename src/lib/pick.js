import { getSessionJSON, setSessionJSON } from './storage'

const STATE_KEY = 'mixpatti.pickState'

// sessionStorage, not localStorage: a user asked for the shuffle-bag/
// sideshow-ban state to start fresh every time the app is genuinely
// reopened (a new PWA launch, a new tab), while still surviving an
// in-session reload (a manual refresh, or pwaUpdate.js's own silent
// update-reload) so the never-repeats-immediately guarantee doesn't
// break mid-session. Every OTHER piece of persisted state in this app
// (starred/muted prefs, players, audio mute, reading mode) deliberately
// stays on localStorage - only the pick-engine's own draw state resets.

// Target share of ROUNDS (not entries) that land "sideshow banned".
// variations.json marks a handful of entries sideshowBanned: true because
// the mechanic makes a sideshow nonsensical - non-negotiable. Everything
// else gets an extra per-round coin flip so the two sources add up to ~33%;
// see bannedRollRate() for the derivation.
export const TARGET_BANNED_SHARE = 0.33

// A reroll only fires when this round's pick is banned AND last round's was
// too. Capped so a pathological data change (e.g. a bag mostly
// sideshowBanned) can't recurse away; if every attempt comes up banned, the
// last one is just accepted - best-effort, not a hard guarantee.
const MAX_REROLL_ATTEMPTS = 4

// A starred id is listed this many times in bagMain's own source list,
// instead of once like everything else - so across one full shuffle cycle
// it is drawn exactly this many times while every other unmuted id is
// drawn exactly once. Deliberately a flat per-cycle COUNT, not a share of
// all draws: the old STARRED_SHARE design (a 30% pre-roll into a separate
// bag) made starring even 1-2 twists swallow up roughly a third of EVERY
// draw regardless of bag size - a user reported exactly the visible
// symptom (one favorite repeating 3+ times in a short session while most
// of the other 30 twists never showed at all). See pickNext()'s own doc
// comment for how duplicating the id in-place reuses bagMain's existing
// machinery for free instead of needing a second bag.
const STARRED_MULTIPLIER = 2

// Below this many unmuted variations, honoring the mute set at all would
// starve drawFrom() down toward the empty-pool case - so it's ignored
// outright instead, not partially. useVariationPrefs.js imports this same
// constant so the UI can grey out the mute control at the identical floor
// before this backstop ever needs to fire.
export const MIN_UNMUTED = 2

// Target size, before scaling down for small bags, of the "keep these out
// of the front of the next cycle" window - see historyWindowSize().
const HISTORY_WINDOW_TARGET = 5

/**
 * How many of a bag's own most recent draws the next reshuffle should try
 * to keep out of the FRONT of the new cycle - which, per drawFrom()'s own
 * comment, is actually the END of the freshly shuffled array, since draws
 * pop from list[top] downward.
 *
 * A flat HISTORY_WINDOW_TARGET can't apply to every bag size: a heavily
 * muted bagMain (down toward the MIN_UNMUTED floor) or a synthetic test bag
 * can be very small, where reserving a big chunk of it as "can't come up
 * yet" would leave nothing to fill the remaining draw slots. Scaling with
 * sourceIds.length instead - floor(N / 3) capped at the target -
 * guarantees N - 2*windowSize >= windowSize, i.e. at least as many
 * non-avoided ids remain as the window itself needs to fill with swap
 * candidates (see avoidRecentInFront()). Same floor-not-gate idea as
 * MIN_UNMUTED - just a continuously scaled size instead of a yes/no cutoff.
 * bagMain, the full unmuted pool (32 entries live today, plus one extra
 * slot per starred id - see STARRED_MULTIPLIER), sits comfortably above the
 * cap in real play and always gets the full HISTORY_WINDOW_TARGET window.
 */
export function historyWindowSize(sourceIds) {
  return Math.min(HISTORY_WINDOW_TARGET, Math.floor(sourceIds.length / 3))
}

/**
 * pickNext()'s reroll (see there) actively suppresses two banned results
 * landing back-to-back, which pulls the STEADY-STATE share of ACCEPTED
 * results that are banned below the raw per-draw probability that feeds
 * it - and the gap grows sharply as that per-draw probability rises. This
 * inverts that relationship: given the desired steady-state share
 * (TARGET_BANNED_SHARE), find the per-draw probability p that actually
 * produces it, so bannedRollRate() can solve for a roll rate against p
 * instead of naively against TARGET_BANNED_SHARE itself.
 *
 * Modeling "was the last ACCEPTED result banned" as a 2-state Markov chain
 * gives a closed form for the steady-state share S in terms of the
 * per-draw probability p and the reroll cap:
 *
 *   S = p / (1 + p - p^MAX_REROLL_ATTEMPTS)
 *
 * (from state "last was banned": the loop keeps rerolling while the new
 * draw is ALSO banned, up to MAX_REROLL_ATTEMPTS, so the result is banned
 * only if every attempt up to and including the final forced-accept one
 * rolls banned, probability p^MAX_REROLL_ATTEMPTS; from state "last was
 * NOT banned" there's no reroll at all, so the result is banned with
 * probability p; solving the resulting balance equation for the
 * steady-state S gives the formula above). Verified empirically against
 * pickNext() itself (see pick.test.js) - matches within statistical noise.
 *
 * Inverting a degree-MAX_REROLL_ATTEMPTS polynomial for p in closed form
 * isn't practical, so this bisects instead: S(p) is monotonically
 * increasing on [0, 1], so a plain binary search converges quickly and
 * needs no data beyond the target share and the reroll cap.
 */
export function requiredPerDrawRate(targetShare) {
  if (targetShare <= 0) return 0
  if (targetShare >= 1) return 1
  let lo = 0
  let hi = 1
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    const steadyStateShare = mid / (1 + mid - mid ** MAX_REROLL_ATTEMPTS)
    if (steadyStateShare < targetShare) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/**
 * Non-strict rate needed on the remaining entries so the strict-banned
 * share plus this extra roll converge on the PER-DRAW probability that
 * yields TARGET_BANNED_SHARE once pickNext()'s reroll has done its
 * suppressing (see requiredPerDrawRate()) - derived from the live dataset
 * every call rather than hardcoded - this repo has a documented history of
 * stale hardcoded counts (see git log "Fix stale 20-variation references
 * after content update").
 *
 *   strictShare + eligibleShare * rate = requiredPerDrawRate(TARGET_BANNED_SHARE)
 */
export function bannedRollRate(variations) {
  const total = variations.length
  if (total === 0) return 0
  const strict = variations.filter((v) => v.sideshowBanned === true).length
  const eligible = total - strict
  if (eligible <= 0) return 0
  const perDrawTarget = requiredPerDrawRate(TARGET_BANNED_SHARE)
  const shortfall = Math.max(0, perDrawTarget - strict / total)
  return Math.min(1, (shortfall * total) / eligible)
}

/**
 * True if `a` and `b` contain exactly the same ids with the same
 * multiplicities, order ignored - a plain Set-membership check isn't
 * enough here since bagMain's source list now repeats a starred id
 * STARRED_MULTIPLIER times (see there): re-starring a DIFFERENT id while
 * unstarring the old one changes which id is duplicated without changing
 * the overall set of ids present at all, which a Set-based comparison
 * would miss entirely.
 */
function sameIdMultiset(a, b) {
  if (!Array.isArray(a) || a.length !== b.length) return false
  const sortedA = [...a].sort()
  const sortedB = [...b].sort()
  return sortedA.every((id, i) => id === sortedB[i])
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
 * exact source list it was shuffled from. If variations.json has since
 * added, removed, or re-muted/starred anything - including just swapping
 * WHICH id is starred, since that changes a duplicate count rather than
 * membership (see sameIdMultiset()) - that source list no longer matches
 * bagSourceIds, and a stale pool can't tell "this id is brand new" apart
 * from "this id was already drawn earlier this cycle", since both are
 * simply absent from `remaining`. Rather than leave newly-added or
 * newly-starred variations unreachable until whatever partial cycle
 * happens to be mid-flight empties out on its own (worst case: a full
 * bag's worth of picks), treat any source-list mismatch as a reason to
 * drop the bag and reshuffle fresh from the current data on the very next
 * draw - see drawFrom()'s empty-pool path. Persisting the source list
 * alongside the pool (writeState) is what makes this comparison possible
 * at all. The bag's recent-draw history (bagMainHistory, see
 * historyWindowSize()) is dropped on the exact same mismatch - a history
 * of draws from a bag whose membership just changed is stale in the same
 * way `remaining` is.
 *
 * A previously-persisted mixpatti.pickState still has the OLD bagA/bagB
 * (or bagMain/bagStar) shape - it has no bagMainSource matching TODAY's
 * source-list format at all, so `sameIdMultiset` below (comparing against
 * `undefined`, or against a same-length-but-unduplicated list) is false,
 * and this function falls through to a fresh bagMain cycle on the very
 * next draw. No migration code needed for that; this read path already
 * handles it.
 */
function readState(bagSourceIds) {
  // `stored` fails this check (falls through to a fresh cycle below) for
  // anything that isn't a plain object - including `null` (nothing
  // persisted this session, or getSessionJSON swallowed a corrupt/
  // unavailable read) and a bare array (the old mixpatti.unseenIds
  // single-array shape, which has no .bagMain).
  const stored = getSessionJSON(STATE_KEY, null)
  if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
    const bagMainFresh = sameIdMultiset(stored.bagMainSource, bagSourceIds.bagMain)
    return {
      bagMain: bagMainFresh && Array.isArray(stored.bagMain) ? stored.bagMain : [],
      bagMainHistory:
        bagMainFresh && Array.isArray(stored.bagMainHistory) ? stored.bagMainHistory : [],
      lastBanned:
        typeof stored.lastBanned === 'boolean' ? stored.lastBanned : null,
    }
  }
  return {
    bagMain: [],
    bagMainHistory: [],
    lastBanned: null,
  }
}

function writeState(state, bagSourceIds) {
  setSessionJSON(STATE_KEY, {
    ...state,
    bagMainSource: bagSourceIds.bagMain,
  })
}

/**
 * Swaps any id in `avoidIds` out of the LAST `windowSize` positions of
 * `list` for a non-avoided id from earlier in the array. Mutates `list` in
 * place. Those last positions are the FRONT-drawn end of a fresh cycle -
 * see drawFrom()'s comment: draws pop from the array's end backward, so
 * the tail is what gets dealt first.
 *
 * Swaps rather than sorting/filtering avoidIds toward the back on purpose:
 * a sort would make the window's contents deterministic (whichever ids
 * simply weren't avoided, in whatever order shuffled() happened to leave
 * them), where a swap keeps it a fair permutation of exactly the ids that
 * end up there.
 *
 * historyWindowSize()'s N >= 3*windowSize margin is what guarantees this
 * never runs out of candidates under normal operation: avoidIds.size <=
 * windowSize by construction (drawFrom() clamps it before calling this),
 * so even in the worst case - every avoided id landing inside the window -
 * there are still N - 2*windowSize >= windowSize untouched ids outside it
 * to swap in. The `candidatePool.length === 0` bail-out below is defense-
 * in-depth for when that margin doesn't hold (e.g. a hand-edited
 * sessionStorage value with an oversized history) - same best-effort-not-a-
 * guarantee precedent as MAX_REROLL_ATTEMPTS elsewhere in this file: leave
 * that one slot as the shuffle already had it rather than throw or loop.
 */
function avoidRecentInFront(list, avoidIds, windowSize) {
  const n = list.length
  const windowStart = n - windowSize
  const candidatePool = []
  for (let i = 0; i < windowStart; i++) {
    if (!avoidIds.has(list[i])) candidatePool.push(i)
  }
  for (let pos = n - 1; pos >= windowStart; pos--) {
    if (!avoidIds.has(list[pos])) continue
    if (candidatePool.length === 0) break
    const pick = Math.floor(Math.random() * candidatePool.length)
    const from = candidatePool[pick]
    ;[list[pos], list[from]] = [list[from], list[pos]]
    candidatePool.splice(pick, 1) // now sitting in the window - can't reuse it
  }
}

/**
 * Pop one id off a shuffle-bag, refilling+reshuffling from `sourceIds` when
 * it runs dry OR when the only id left would just hand `previousId` right
 * back (see below). Also updates and returns this bag's own recent-draw
 * history ring buffer (see historyWindowSize()) - callers thread the
 * returned value back in on the next call for the same bag.
 *
 * A fresh shuffle can coincidentally deal the same id that just finished the
 * previous cycle right back out on top - and since a bag only ever loses the
 * id it hands out, that refill instant would be the ONLY place a repeat
 * could sneak in IF `sourceIds` never repeated an id within itself. But a
 * starred id is deliberately listed STARRED_MULTIPLIER times in bagMain's
 * own source list (see pickNext()) - so two of its copies can easily end up
 * adjacent in a fresh shuffle, which is exactly the same shape of hazard:
 * `previousId` can be sitting un-drawn elsewhere in `remaining` even though
 * it was just handed out. drawFrom()'s previousId swap below - and its
 * hardening against a single leftover id equalling previousId - is the ONLY
 * thing that ever prevents a repeat, full stop, whether the near-miss came
 * from a coincidental reshuffle or from a starred id's own duplicate copies.
 * If the bag is down to exactly one id, and it's previousId, the `top > 0`
 * swap guard has nothing to swap with and would otherwise repeat it.
 * Treating "one id left, and it's previousId" the same as "no ids left"
 * closes that: a fresh reshuffle of `sourceIds` always has an alternative,
 * PROVIDED sourceIds itself has at least 2 members - true in real play
 * (bagMain always has far more), so this branch is a defensive guarantee
 * rather than something normally exercised.
 *
 * The swap itself still runs unconditionally rather than only at a
 * detected refill boundary: it's cheap, and it also covers a hand-edited or
 * corrupt sessionStorage value that puts previousId on top of an otherwise
 * mid-cycle bag.
 *
 * On a genuine reshuffle (the `exhausted` branch), `history` - this SAME
 * bag's own most recently drawn ids, oldest first - gets a chance to steer
 * the fresh shuffle away from repeating them up front, via
 * avoidRecentInFront(), before the previousId swap above ever runs. Only
 * `history.slice(-windowSize)` is trusted as the avoid-set even though
 * callers already cap it there (see pickNext()) - a hand-edited
 * sessionStorage value could hand back something longer, and
 * avoidRecentInFront()'s feasibility proof depends on the avoid-set never
 * exceeding windowSize.
 */
function drawFrom(remaining, sourceIds, previousId, history = []) {
  const windowSize = historyWindowSize(sourceIds)
  const exhausted =
    remaining.length === 0 || (remaining.length === 1 && remaining[0] === previousId)
  const list = exhausted ? shuffled(sourceIds) : remaining.slice()

  if (exhausted && windowSize > 0 && history.length > 0) {
    avoidRecentInFront(list, new Set(history.slice(-windowSize)), windowSize)
  }

  const top = list.length - 1
  if (top > 0 && list[top] === previousId) {
    const j = Math.floor(Math.random() * top) // 0..top-1
    ;[list[top], list[j]] = [list[j], list[top]]
  }

  const id = list[top]
  // slice(-0) returns the WHOLE array, not an empty one - windowSize === 0
  // needs its own branch rather than leaning on slice's negative-index math.
  const nextHistory = windowSize > 0 ? [...history, id].slice(-windowSize) : []
  return { id, rest: list.slice(0, top), history: nextHistory }
}

/**
 * Pick the next variation, plus whether sideshow is banned this round.
 *
 * A single shuffle-bag, bagMain, feeds the draw - every unmuted id gets one
 * slot, and a starred unmuted id gets STARRED_MULTIPLIER slots instead, by
 * simply being listed that many times in bagMain's own source list. There
 * used to be a separate bagStar - a pre-roll pool of
 * starred ids rolled probabilistically (STARRED_SHARE) BEFORE falling
 * through to bagMain - but that made starring even 1-2 twists swallow up
 * roughly a third of EVERY draw regardless of how many other twists
 * existed, which is far more concentrated than "duplicate the id in the
 * bag" reads as. Duplicating in place instead means a starred id is drawn
 * exactly STARRED_MULTIPLIER times per full cycle through bagMain, same as
 * everything else's exactly-once - a flat, bag-size-independent boost -
 * and it comes for free out of the SAME single-bag machinery already built
 * for the plain unmuted case: drawFrom()'s previousId swap (which already
 * has to handle a fresh reshuffle coincidentally repeating an id, see its
 * own comment) equally covers two of a starred id's own duplicate copies
 * landing adjacent in a reshuffle, and avoidRecentInFront() equally keeps
 * a just-drawn duplicate off the front of the next cycle. There's also no
 * `starEligible` floor anymore (the old bagStar design needed >= 2 starred
 * ids, since an isolated 1-member exclusive bag couldn't ever avoid
 * repeating itself) - a single starred id duplicated inside the much
 * larger bagMain has plenty of other ids for the previousId swap to use,
 * so it works uniformly regardless of how many things are starred,
 * including just one.
 *
 * There used to be a second exclusive bag here too (the "classics" vs "fun
 * twists" split, drawn by variation.priority) - that concept is gone along
 * with the priority field itself; every variation is equal weight, plus
 * whatever extra bagMain slots starring adds.
 *
 * The never-repeats-immediately guarantee has nothing to do with bags
 * being disjoint (there's only one now, and duplicate entries live inside
 * it on purpose) - drawFrom()'s unconditional previousId-swap, and its
 * hardening against a single leftover id equalling previousId, is the ONLY
 * thing that ever prevents an immediate repeat.
 *
 * Muting: `mutedIds` are dropped from bagMain's source id list up front
 * (see effectiveMutedSet(), which also holds the floor below which muting
 * is ignored outright), and bannedRollRate() is computed over that same
 * unmuted list so the ~33% target doesn't drift as entries get muted.
 * Changing which ids are muted OR starred changes bagSourceIds.bagMain -
 * readState() compares that (as a multiset - see sameIdMultiset()) against
 * the persisted bagMainSource snapshot, and a mismatch drops the bag and
 * reshuffles it fresh on the very next draw. This is the same mechanism
 * that already makes a newly-added variations.json entry reachable
 * immediately; muting/starring just gives the app another way to trigger
 * it deliberately.
 *
 * The sideshow-ban reroll compares EFFECTIVE (resolved) banned status, not
 * the static `sideshowBanned` data flag alone - that's what the player
 * actually experiences two rounds running. Trade-off: unlike the
 * twist-repeat guarantee (structural, absolute), this is a bounded reroll,
 * so it is best-effort - with MAX_REROLL_ATTEMPTS capped, two genuinely
 * strict-banned entries CAN still land back-to-back in the unlucky case
 * where every attempt keeps re-drawing a banned entry. A rerolled
 * (discarded) attempt still pops its draw off bagMain before looping to
 * try again - the cycle quietly runs one draw short of a full round-trip
 * through its own membership when this fires, which is the tradeoff for a
 * reroll not being a hard guarantee.
 *
 * bagMain also carries its own bagMainHistory (see historyWindowSize()) so
 * that when it reshuffles, the new cycle's first few draws avoid the
 * outgoing cycle's last few - the bag cycling through all its own members
 * before repeating any (see drawFrom()) already stops the same twist from
 * clustering near itself in absolute terms, but says nothing about *where
 * in the next cycle* it can land, and a coincidental reshuffle can deal it
 * right back out near the front. That's a structural (not best-effort)
 * guarantee - separate from the sideshow-ban reroll above, which stays
 * probabilistic because rerolling a ban is a completely different kind of
 * unlucky.
 */
export function pickNext(variations, previousId, { mutedIds = [], starredIds = [] } = {}) {
  const byId = new Map(variations.map((v) => [v.id, v]))
  const mutedSet = effectiveMutedSet(variations, mutedIds)
  const starredSet = new Set(starredIds)
  const unmuted = variations.filter((v) => !mutedSet.has(v.id))
  const bagSourceIds = {
    bagMain: unmuted.flatMap((v) =>
      starredSet.has(v.id) ? Array(STARRED_MULTIPLIER).fill(v.id) : [v.id],
    ),
  }
  const state = readState(bagSourceIds)
  const rollRate = bannedRollRate(unmuted)

  let variation
  let banned
  for (let attempt = 1; attempt <= MAX_REROLL_ATTEMPTS; attempt++) {
    const { id, rest, history } = drawFrom(
      state.bagMain,
      bagSourceIds.bagMain,
      previousId,
      state.bagMainHistory,
    )
    state.bagMain = rest
    state.bagMainHistory = history

    variation = byId.get(id) ?? variations[0]
    banned = variation.sideshowBanned === true || Math.random() < rollRate

    const backToBack = banned && state.lastBanned === true
    if (!backToBack || attempt === MAX_REROLL_ATTEMPTS) break
    // Otherwise: this pick is discarded unseen. It stays popped from
    // bagMain for the rest of this cycle (resurfaces at the next reshuffle)
    // - loop for a fresh draw.
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
