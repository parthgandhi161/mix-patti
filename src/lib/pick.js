import { getStorageJSON, setStorageJSON } from './storage'

const STATE_KEY = 'mixpatti.pickState'

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
// starring one twist vs five changes which starred twist comes up, not how
// often "some starred twist" does. Rolled as a PRE-roll ahead of the
// bagMain fallback below, not a slice carved out of it - a miss falls
// through to the ordinary bagMain draw exactly as it ran before starring
// existed, so starring something can't dilute the rest of the pool.
const STARRED_SHARE = 0.3

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
 * A flat HISTORY_WINDOW_TARGET can't apply to every bag: bagStar (the
 * starred ids) can be very small - sometimes just the starEligible floor of
 * 2 members - where reserving a big chunk of it as "can't come up yet"
 * would leave nothing to fill the remaining draw slots. Scaling with
 * sourceIds.length instead - floor(N / 3) capped at the target -
 * guarantees N - 2*windowSize >= windowSize, i.e. at least as many
 * non-avoided ids remain as the window itself needs to fill with swap
 * candidates (see avoidRecentInFront()). Same floor-not-gate idea as
 * MIN_UNMUTED/starEligible - just a continuously scaled size instead of a
 * yes/no cutoff, which is also why bagStar needs no special case: at its
 * starEligible floor of 2 members this already evaluates to 0 (no
 * avoidance at all), which is correct - a 2-member bag has no room to
 * spare for one. bagMain, the full unmuted pool (32 entries live today),
 * sits comfortably above the cap and always gets the full
 * HISTORY_WINDOW_TARGET window.
 */
export function historyWindowSize(sourceIds) {
  return Math.min(HISTORY_WINDOW_TARGET, Math.floor(sourceIds.length / 3))
}

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
 * added, removed, or re-muted/starred anything, that set no longer matches
 * bagSourceIds - and a stale pool can't tell "this id is brand new" apart
 * from "this id was already drawn earlier this cycle", since both are
 * simply absent from `remaining`. Rather than leave newly-added
 * variations unreachable until whatever partial cycle happens to be
 * mid-flight empties out on its own (worst case: a full bag's worth of
 * picks), treat any source-set mismatch as a reason to drop that bag and
 * reshuffle fresh from the current data on the very next draw - see
 * drawFrom()'s empty-pool path. Persisting the source sets alongside the
 * pools (writeState) is what makes this comparison possible at all. Each
 * bag's recent-draw history (bag<Key>History, see historyWindowSize()) is
 * dropped on the exact same mismatch - a history of draws from a bag whose
 * membership just changed is stale in the same way `remaining` is.
 *
 * A previously-persisted mixpatti.pickState still has the OLD bagA/bagB
 * shape, not bagMain - it has no bagMainSource at all, so `sameIdSet`
 * below (comparing against `undefined`) is false unconditionally, and this
 * function falls through to a fresh bagMain cycle on the very next draw.
 * No migration code needed for that; this read path already handles it.
 */
function readState(bagSourceIds) {
  // `stored` fails this check (falls through to a fresh cycle below) for
  // anything that isn't a plain object - including `null` (nothing
  // persisted, or getStorageJSON swallowed a corrupt/unavailable read)
  // and a bare array (the old mixpatti.unseenIds single-array shape,
  // which has no .bagMain/.bagStar).
  const stored = getStorageJSON(STATE_KEY, null)
  if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
    const bagMainFresh = sameIdSet(stored.bagMainSource, bagSourceIds.bagMain)
    const bagStarFresh = sameIdSet(stored.bagStarSource, bagSourceIds.bagStar)
    return {
      bagMain: bagMainFresh && Array.isArray(stored.bagMain) ? stored.bagMain : [],
      bagMainHistory:
        bagMainFresh && Array.isArray(stored.bagMainHistory) ? stored.bagMainHistory : [],
      bagStar: bagStarFresh && Array.isArray(stored.bagStar) ? stored.bagStar : [],
      bagStarHistory:
        bagStarFresh && Array.isArray(stored.bagStarHistory) ? stored.bagStarHistory : [],
      lastBanned:
        typeof stored.lastBanned === 'boolean' ? stored.lastBanned : null,
    }
  }
  return {
    bagMain: [],
    bagMainHistory: [],
    bagStar: [],
    bagStarHistory: [],
    lastBanned: null,
  }
}

function writeState(state, bagSourceIds) {
  setStorageJSON(STATE_KEY, {
    ...state,
    bagMainSource: bagSourceIds.bagMain,
    bagStarSource: bagSourceIds.bagStar,
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
 * localStorage value with an oversized history) - same best-effort-not-a-
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
 * could sneak in IF a bag were tracked in total isolation. But bagMain and
 * bagStar are NOT disjoint - bagStar's ids are a subset of bagMain's, drawn
 * from deliberately so a starred twist is reachable via either path (that's
 * the boost, not a separate exclusive group) - so `previousId` can be
 * sitting un-drawn in one bag's pool even though it was just handed out by
 * the OTHER. There is no "disjoint by construction" argument to lean on
 * here at all, for either bag: drawFrom()'s previousId swap below - and its
 * hardening against a single leftover id equalling previousId - is the ONLY
 * thing that ever prevents a repeat, full stop. If the bag in play happens
 * to be down to exactly one id, and it's previousId, the `top > 0` swap
 * guard has nothing to swap with and would otherwise repeat it. Treating
 * "one id left, and it's previousId" the same as "no ids left" closes that:
 * a fresh reshuffle of `sourceIds` always has an alternative, PROVIDED
 * sourceIds itself has at least 2 members - which is exactly why pickNext()
 * only ever calls this for bagStar when starEligible (see there); bagMain
 * always has far more than 2 members in real play, so this branch is a
 * defensive guarantee there rather than something normally exercised.
 *
 * The swap itself still runs unconditionally rather than only at a
 * detected refill boundary: it's cheap, and it also covers a hand-edited or
 * corrupt localStorage value that puts previousId on top of an otherwise
 * mid-cycle bag.
 *
 * On a genuine reshuffle (the `exhausted` branch), `history` - this SAME
 * bag's own most recently drawn ids, oldest first - gets a chance to steer
 * the fresh shuffle away from repeating them up front, via
 * avoidRecentInFront(), before the previousId swap above ever runs. Only
 * `history.slice(-windowSize)` is trusted as the avoid-set even though
 * callers already cap it there (see pickNext()) - a hand-edited
 * localStorage value could hand back something longer, and
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
 * Two shuffle-bags feed the draw: bagMain (every unmuted id) is the
 * default, and bagStar - a pre-roll pool of starred unmuted ids
 * (STARRED_SHARE), rolled BEFORE falling through to bagMain each attempt -
 * gives starred twists a boost. bagStar's ids deliberately OVERLAP
 * bagMain's: a starred twist lives in both at once, so it's reachable via
 * either path - that's the boost, not a separate exclusive group. There
 * used to be a second exclusive bag here (the "classics" vs "fun twists"
 * split, drawn by variation.priority) - that concept is gone along with
 * the priority field itself; every variation is equal weight now, and
 * bagMain is simply the whole unmuted pool.
 *
 * Because there is now only ONE non-star bag, there is no "two disjoint
 * bags can't hand back the same id" argument to lean on for the
 * never-repeats-immediately guarantee, and there never really was one for
 * bagStar either (see drawFrom()'s own comment). drawFrom()'s unconditional
 * previousId-swap - and its hardening against a single leftover id
 * equalling previousId - is the ONLY thing that prevents an immediate
 * repeat, for both bags, always.
 *
 * Muting: `mutedIds` are dropped from bagMain/bagStar's source id lists up
 * front (see effectiveMutedSet(), which also holds the floor below which
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
 * entries in 32 and a ~20% overall banned rate, that chain is vanishingly
 * rare in practice. A rerolled (discarded) attempt still pops its draw off
 * whichever bag served it before looping to try again - that bag's cycle
 * quietly runs one draw short of a full round-trip through its own
 * membership when this fires, which is the tradeoff for a reroll not being
 * a hard guarantee.
 *
 * Each bag also carries its own bag<Key>History (see historyWindowSize())
 * so that when IT reshuffles, the new cycle's first few draws avoid the
 * outgoing cycle's last few - a bag cycling through all its own members
 * before repeating any (see drawFrom()) already stops the same twist from
 * clustering near itself in absolute terms, but says nothing about *where
 * in the next cycle* it can land, and a coincidental reshuffle can deal it
 * right back out near the front. That's a per-bag, structural (not
 * best-effort) guarantee - separate from the sideshow-ban reroll above,
 * which stays probabilistic because rerolling a ban is a completely
 * different kind of unlucky.
 */
export function pickNext(variations, previousId, { mutedIds = [], starredIds = [] } = {}) {
  const byId = new Map(variations.map((v) => [v.id, v]))
  const mutedSet = effectiveMutedSet(variations, mutedIds)
  const starredSet = new Set(starredIds)
  const unmuted = variations.filter((v) => !mutedSet.has(v.id))
  const bagSourceIds = {
    bagMain: unmuted.map((v) => v.id),
    bagStar: unmuted.filter((v) => starredSet.has(v.id)).map((v) => v.id),
  }
  const starEligible = bagSourceIds.bagStar.length >= 2
  const state = readState(bagSourceIds)
  const rollRate = bannedRollRate(unmuted)

  let variation
  let banned
  for (let attempt = 1; attempt <= MAX_REROLL_ATTEMPTS; attempt++) {
    const useStarred = starEligible && Math.random() < STARRED_SHARE
    const bagKey = useStarred ? 'bagStar' : 'bagMain'
    const { id, rest, history } = drawFrom(
      state[bagKey],
      bagSourceIds[bagKey],
      previousId,
      state[`${bagKey}History`],
    )
    state[bagKey] = rest
    state[`${bagKey}History`] = history

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
