/**
 * Every localStorage/sessionStorage access in this app goes through here.
 *
 * Both can throw in private-browsing modes (or be entirely unavailable) -
 * every function below swallows that silently, so a blocked store degrades
 * to "nothing persists" rather than a crash. This module owns exactly
 * that: the raw get/set and the JSON parse/stringify + try/catch. It does
 * not know about any particular key's stored shape or fallback/validation
 * rules - see pick.js's readState()/writeState() for that.
 *
 * localStorage is the default for anything meant to survive across app
 * opens (preferences, players, etc). sessionStorage is for the opposite -
 * state that should reset to fresh when the PWA/tab is genuinely closed
 * and reopened, but still survive an in-session reload (a manual refresh,
 * or pwaUpdate.js's own silent update-reload) - see pick.js's own use of
 * getSessionJSON/setSessionJSON for its shuffle-bag state, which a user
 * explicitly asked to start fresh each time they open the app again.
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

export function getSessionJSON(key, fallback) {
  try {
    const raw = sessionStorage.getItem(key)
    return raw === null ? fallback : JSON.parse(raw)
  } catch {
    return fallback
  }
}

export function setSessionJSON(key, value) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage unavailable - this value just won't persist */
  }
}
