import { describe, expect, it } from 'vitest'
import { TIMELINE, TOTAL_MS } from './timing.js'

describe('TOTAL_MS', () => {
  // TOTAL_MS deliberately excludes TIMELINE.hold (see the file's own
  // comment) - Mixing.jsx's phase clock only needs shuffle+reveal to know
  // when the carousel itself is done; hold is a separate post-landing
  // beat. This pins that derivation so an edit to TIMELINE can't silently
  // drift TOTAL_MS out of sync with it - see CLAUDE.md's note on
  // src/lib/timing.js being the single source of truth for this.
  it('is the sum of shuffle + reveal, not hold', () => {
    expect(TOTAL_MS).toBe(TIMELINE.shuffle + TIMELINE.reveal)
    expect(TOTAL_MS).not.toBe(TIMELINE.shuffle + TIMELINE.reveal + TIMELINE.hold)
  })
})
