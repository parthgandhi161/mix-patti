/**
 * Pick a random variation, never the one we just showed.
 *
 * Filtering the previous pick out of the pool (rather than re-rolling
 * in a loop) keeps every remaining variation equally likely and can't
 * spin forever.
 */
export function pickNext(variations, previousId) {
  const pool =
    variations.length > 1
      ? variations.filter((v) => v.id !== previousId)
      : variations
  return pool[Math.floor(Math.random() * pool.length)]
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
