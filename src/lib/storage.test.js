import { describe, expect, it, vi } from 'vitest'
import {
  getStorageItem,
  getStorageJSON,
  setStorageItem,
  setStorageJSON,
} from './storage.js'

describe('getStorageItem / setStorageItem', () => {
  it('round-trips a raw string', () => {
    setStorageItem('k', 'hello')
    expect(getStorageItem('k')).toBe('hello')
  })

  it('returns null for a missing key', () => {
    expect(getStorageItem('missing')).toBeNull()
  })

  it('swallows a throwing localStorage.getItem and returns null', () => {
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('blocked (private browsing)')
    })
    expect(getStorageItem('k')).toBeNull()
  })

  it('swallows a throwing localStorage.setItem without throwing', () => {
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })
    expect(() => setStorageItem('k', 'v')).not.toThrow()
  })
})

describe('getStorageJSON / setStorageJSON', () => {
  it('round-trips a JSON-serialisable value', () => {
    setStorageJSON('k', { a: 1, b: [2, 3] })
    expect(getStorageJSON('k', null)).toEqual({ a: 1, b: [2, 3] })
  })

  it('returns the fallback when the key is missing', () => {
    expect(getStorageJSON('missing', 'fallback')).toBe('fallback')
  })

  it('returns the fallback rather than throwing on malformed stored JSON', () => {
    localStorage.setItem('k', '{not valid json')
    expect(getStorageJSON('k', 'fallback')).toBe('fallback')
  })

  it('swallows a throwing localStorage.setItem without throwing', () => {
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })
    expect(() => setStorageJSON('k', { a: 1 })).not.toThrow()
  })
})
