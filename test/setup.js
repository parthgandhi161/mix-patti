import { afterEach, beforeEach, vi } from 'vitest'

/**
 * Minimal in-memory Storage stub. pick.js (via src/lib/storage.js) only
 * ever calls getItem/setItem; removeItem/clear are included for
 * completeness.
 *
 * Installed fresh before every test so state never leaks between cases -
 * tests that need seeded localStorage do so via `localStorage.setItem`
 * directly in the test body, after this reset has already run.
 */
class MemoryStorage {
  #store = new Map()

  getItem(key) {
    return this.#store.has(key) ? this.#store.get(key) : null
  }

  setItem(key, value) {
    this.#store.set(key, String(value))
  }

  removeItem(key) {
    this.#store.delete(key)
  }

  clear() {
    this.#store.clear()
  }
}

beforeEach(() => {
  globalThis.localStorage = new MemoryStorage()
})

afterEach(() => {
  // Restores any vi.spyOn(Math, 'random') / vi.spyOn(localStorage, ...)
  // from the previous test - without this, a stubbed Math.random would
  // silently leak into the next test's "real randomness" assertions.
  vi.restoreAllMocks()
})
