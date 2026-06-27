// Local, per-device display preferences (no server round-trip, no migration).
// These only affect what *this* device shows — not stored data.
const KEYS = {
  hideRidesUnderKm: 'pref.hideRidesUnderKm',
  enabledSports: 'pref.enabledSports',
  onboardedUsers: 'pref.onboardedUsers',
}

// Sports the user currently tracks. Disabling one hides it from logging and
// the aggregate views (cards, stats) — but never touches stored sessions, so
// past sessions of a disabled sport still show in the calendar and history.
export const ALL_SPORTS = ['cycling', 'running', 'swimming', 'climbing', 'strength', 'finger']

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

// First-run onboarding: a new user picks their sports before reaching the app.
// Tracked per *user id* (not per device) — sport prefs live in localStorage and
// are shared across accounts on the same browser, so they can't tell us whether
// *this* user has been through the picker.
function onboardedIds() {
  try {
    const raw = localStorage.getItem(KEYS.onboardedUsers)
    const ids = raw ? JSON.parse(raw) : []
    return Array.isArray(ids) ? ids : []
  } catch {
    return []
  }
}

export function isOnboarded(userId) {
  if (!userId) return true // nothing to gate on until we know who's signed in
  return onboardedIds().includes(userId)
}

export function setOnboarded(userId) {
  if (!userId) return
  const ids = onboardedIds()
  if (!ids.includes(userId)) {
    localStorage.setItem(KEYS.onboardedUsers, JSON.stringify([...ids, userId]))
  }
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
