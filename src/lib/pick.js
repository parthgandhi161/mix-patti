const UNSEEN_KEY = 'mixpatti.unseenIds'

/**
 * Which variations haven't been shown yet this cycle, remembered
 * across refreshes. localStorage can throw in private-browsing modes
 * (mirrors useMuted.js) - a failed read just means "no memory, start
 * a fresh cycle".
 */
function readUnseen(allIds) {
  try {
    const stored = JSON.parse(localStorage.getItem(UNSEEN_KEY) ?? 'null')
    if (Array.isArray(stored)) {
      return stored.filter((id) => allIds.includes(id))
    }
  } catch {
    /* corrupt or unavailable - fall through to a fresh pool */
  }
  return []
}

function writeUnseen(ids) {
  try {
    localStorage.setItem(UNSEEN_KEY, JSON.stringify(ids))
  } catch {
    /* private browsing, etc. - this cycle just won't persist */
  }
}

/**
 * Pick a random variation, cycling through every twist once before any
 * repeat - and remembering where it left off across a page refresh via
 * localStorage. Once the whole set has been shown, the cycle restarts,
 * excluding the just-shown previous pick so the reset boundary itself
 * can't repeat it back-to-back either.
 */
export function pickNext(variations, previousId) {
  const allIds = variations.map((v) => v.id)
  let pool = readUnseen(allIds)
  if (pool.length === 0) pool = allIds

  const candidates =
    pool.length > 1 ? pool.filter((id) => id !== previousId) : pool
  const pickedId = candidates[Math.floor(Math.random() * candidates.length)]

  const nextPool = pool.filter((id) => id !== pickedId)
  writeUnseen(nextPool.length > 0 ? nextPool : allIds)

  return variations.find((v) => v.id === pickedId) ?? variations[0]
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
