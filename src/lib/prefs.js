// Local, per-device display preferences (no server round-trip, no migration).
// These only affect what *this* device shows - not stored data.
const KEYS = {
  hideRidesUnderKm: 'pref.hideRidesUnderKm',
  enabledSports: 'pref.enabledSports',
  onboardedUsers: 'pref.onboardedUsers',
  dashboardWidgets: 'pref.dashboardWidgets',
  logPeriod: 'pref.logPeriod',
}

// Period tracking (Settings → Health). Off by default; turning it on adds
// period logging to the calendar and the cycle card to the dashboard. The
// logged days themselves live on the server (owner-only via RLS).
export function getLogPeriod() {
  try {
    return localStorage.getItem(KEYS.logPeriod) === '1'
  } catch {
    return false
  }
}

export function setLogPeriod(on) {
  if (on) localStorage.setItem(KEYS.logPeriod, '1')
  else localStorage.removeItem(KEYS.logPeriod)
}

// Sports the user currently tracks. Disabling one hides it from logging and
// the aggregate views (cards, stats) - but never touches stored sessions, so
// past sessions of a disabled sport still show in the calendar and history.
export const ALL_SPORTS = ['cycling', 'running', 'swimming', 'climbing', 'strength', 'finger']

export function getEnabledSports() {
  try {
    const raw = localStorage.getItem(KEYS.enabledSports)
    if (!raw) return [...ALL_SPORTS]
    const saved = JSON.parse(raw)
    const kept = ALL_SPORTS.filter((k) => saved.includes(k))
    // Never end up with zero sports - fall back to all if the list is empty.
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
// Tracked per *user id* (not per device) - sport prefs live in localStorage and
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

// Dashboard widgets the user has placed on the front page, in display order.
// Unlike the per-sport totals of old, what shows is now purely the user's
// choice (see src/components/DashboardWidgets.jsx for the catalog). An empty
// list is valid (the user removed everything); only a missing key falls back
// to the default set.
export const DEFAULT_WIDGETS = ['week-summary', 'month-summary', 'streak']

const SPORT_WIDGET = {
  cycling: 'cycling-month',
  running: 'running-month',
  swimming: 'swimming-month',
  climbing: 'climbing-month',
  strength: 'strength-month',
  finger: 'finger-month',
}

// Returns starter widgets for a new user: 2 general + up to 2 sport-specific
// (in the order the user picked their sports), capped at 4 total.
export function defaultWidgetsForSports(sports) {
  const sportWidgets = sports.filter((k) => SPORT_WIDGET[k]).map((k) => SPORT_WIDGET[k]).slice(0, 2)
  return [...DEFAULT_WIDGETS, ...sportWidgets]
}

export function getDashboardWidgets() {
  try {
    const raw = localStorage.getItem(KEYS.dashboardWidgets)
    if (raw == null) return [...DEFAULT_WIDGETS]
    const saved = JSON.parse(raw)
    return Array.isArray(saved) ? saved : [...DEFAULT_WIDGETS]
  } catch {
    return [...DEFAULT_WIDGETS]
  }
}

export function setDashboardWidgets(ids) {
  localStorage.setItem(KEYS.dashboardWidgets, JSON.stringify(Array.isArray(ids) ? ids : []))
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
