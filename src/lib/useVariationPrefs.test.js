import { describe, expect, it } from 'vitest'
import { MIN_UNMUTED } from './pick.js'
import { canToggleMuteId, sanitizeIdList } from './useVariationPrefs.js'

describe('sanitizeIdList', () => {
  it('returns a stored array of string ids unchanged', () => {
    expect(sanitizeIdList(['a', 'b'])).toEqual(['a', 'b'])
  })

  it('falls back to [] for anything that is not an array', () => {
    expect(sanitizeIdList(null)).toEqual([])
    expect(sanitizeIdList(undefined)).toEqual([])
    expect(sanitizeIdList('a')).toEqual([])
    expect(sanitizeIdList({ 0: 'a' })).toEqual([])
  })

  it('drops non-string entries rather than throwing', () => {
    expect(sanitizeIdList(['a', 1, null, {}, 'b'])).toEqual(['a', 'b'])
  })
})

describe('canToggleMuteId', () => {
  it('always allows unmuting an already-muted id, regardless of the floor', () => {
    // Only 2 unmuted left overall - muting one MORE would be refused, but
    // this id is already in mutedIds, i.e. this call is an unmute.
    const mutedIds = Array.from({ length: 25 }, (_, i) => `v${i}`)
    expect(canToggleMuteId('v0', mutedIds, 27)).toBe(true)
  })

  it('allows muting while more than MIN_UNMUTED would remain unmuted', () => {
    const mutedIds = [] // 27 unmuted
    expect(canToggleMuteId('vX', mutedIds, 27)).toBe(true)
  })

  it(`refuses muting once only MIN_UNMUTED (${MIN_UNMUTED}) would remain unmuted`, () => {
    // 25 muted out of 27 -> 2 unmuted; muting a 3rd would drop to 1.
    const mutedIds = Array.from({ length: 27 - MIN_UNMUTED }, (_, i) => `v${i}`)
    expect(canToggleMuteId('vX', mutedIds, 27)).toBe(false)
  })

  it('allows muting down to exactly one above the floor', () => {
    // 24 muted out of 27 -> 3 unmuted; muting one more leaves exactly 2.
    const mutedIds = Array.from({ length: 27 - MIN_UNMUTED - 1 }, (_, i) => `v${i}`)
    expect(canToggleMuteId('vX', mutedIds, 27)).toBe(true)
  })
})
