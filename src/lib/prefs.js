// Local, per-device display preferences (no server round-trip, no migration).
// These only affect what *this* device shows — not stored data.
const KEYS = {
  hideRidesUnderKm: 'pref.hideRidesUnderKm',
  enabledSports: 'pref.enabledSports',
}

// Sports the user currently tracks. Disabling one hides it from logging and
// the aggregate views (cards, stats) — but never touches stored sessions, so
// past sessions of a disabled sport still show in the calendar and history.
export const ALL_SPORTS = ['cycling', 'running', 'swimming', 'climbing', 'strength']

export function getEnabledSports() {
  try {
    const raw = localStorage.getItem(KEYS.enabledSports)
    if (!raw) return [...ALL_SPORTS]
    const saved = JSON.parse(raw)
    const kept = ALL_SPORTS.filter((k) => saved.includes(k))
    // Never end up with zero sports — fall back to all if the list is empty.
    return kept.length ? kept : [...ALL_SPORTS]
  } catch {
    return [...ALL_SPORTS]
  }
}

export function setEnabledSports(keys) {
  const kept = ALL_SPORTS.filter((k) => keys.includes(k))
  localStorage.setItem(KEYS.enabledSports, JSON.stringify(kept.length ? kept : ALL_SPORTS))
}

export function isSportEnabled(key) {
  return getEnabledSports().includes(key)
}

// Minimum cycling distance (km) to show in the dashboard's "Last 7 days" list.
// 0 (or unset) means show everything. Used to hide short commutes.
export function getHideRidesUnderKm() {
  const v = Number(localStorage.getItem(KEYS.hideRidesUnderKm))
  return Number.isFinite(v) && v > 0 ? v : 0
}

export function setHideRidesUnderKm(km) {
  const v = Number(km)
  if (Number.isFinite(v) && v > 0) localStorage.setItem(KEYS.hideRidesUnderKm, String(v))
  else localStorage.removeItem(KEYS.hideRidesUnderKm)
}
