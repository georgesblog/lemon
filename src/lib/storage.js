// Local-storage persistence. No backend, no accounts — the basket and settings
// live on the device and survive between sessions.

const BASKET_KEY = 'basket-score:basket:v1'
const SETTINGS_KEY = 'basket-score:settings:v1'

export function loadBasket() {
  try {
    const raw = localStorage.getItem(BASKET_KEY)
    if (!raw) return []
    const items = JSON.parse(raw)
    return Array.isArray(items) ? items : []
  } catch {
    return []
  }
}

export function saveBasket(items) {
  try {
    localStorage.setItem(BASKET_KEY, JSON.stringify(items))
  } catch {
    /* quota or private mode — basket just won't persist */
  }
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    /* ignore */
  }
}

// Cheap unique id without pulling in a uuid dep.
export function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
