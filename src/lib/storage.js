/**
 * Every localStorage access in this app goes through here.
 *
 * localStorage can throw in private-browsing modes (or be entirely
 * unavailable) - every function below swallows that silently, so a
 * blocked store degrades to "nothing persists this session" rather than
 * a crash. This module owns exactly that: the raw get/set and the JSON
 * parse/stringify + try/catch. It does not know about any particular
 * key's stored shape or fallback/validation rules - see pick.js's
 * readState()/writeState() for that.
 */

export function getStorageItem(key) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function setStorageItem(key, value) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* storage unavailable - this value just won't persist */
  }
}

export function getStorageJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? fallback : JSON.parse(raw)
  } catch {
    return fallback
  }
}

export function setStorageJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage unavailable - this value just won't persist */
  }
}
