// Local, per-device display preferences (no server round-trip, no migration).
// These only affect what *this* device shows - not stored data.
const KEYS = {
  hideRidesUnderKm: 'pref.hideRidesUnderKm',
  enabledSports: 'pref.enabledSports',
  onboardedUsers: 'pref.onboardedUsers',
  dashboardWidgets: 'pref.dashboardWidgets',
  logPeriod: 'pref.logPeriod',
  avatarEmoji: 'pref.avatarEmoji',
  hrZoneCount: 'pref.hrZoneCount',
  hrMaxBpm: 'pref.hrMaxBpm',
  hrZones5: 'pref.hrZones5',
  hrZones7: 'pref.hrZones7',
  hrUseIcu: 'pref.hrUseIcuZones',
}

// ---- heart rate zones (Profile → Heart rate zones) -------------------------
// The user picks 5 or 7 zones and either takes the standard boundaries
// computed from their max HR or edits each boundary by hand. Ceilings are the
// bpm tops of Z1..Z(n-1); the last zone is everything above. All display-only:
// session analysis re-buckets the recorded HR stream with these, and falls
// back to intervals.icu's own zones when nothing is configured here.

// Standard zone ceilings as fractions of max HR (classic 5-zone model; the
// 7-zone splits follow Friel's running zones expressed against max).
const HR_ZONE_PCTS = {
  5: [0.6, 0.7, 0.8, 0.9],
  7: [0.65, 0.75, 0.82, 0.89, 0.94, 0.97],
}

// Take the zones straight from intervals.icu (their count and boundaries,
// bucketed by intervals) instead of the app's own. On by default - it matches
// what the app always did before zones became editable.
export function getUseIcuZones() {
  try {
    return localStorage.getItem(KEYS.hrUseIcu) !== '0'
  } catch {
    return true
  }
}

export function setUseIcuZones(on) {
  if (on) localStorage.removeItem(KEYS.hrUseIcu)
  else localStorage.setItem(KEYS.hrUseIcu, '0')
}

// How many zones the app's own model uses. 5 is the standard.
export function getHrZoneCount() {
  try {
    return localStorage.getItem(KEYS.hrZoneCount) === '7' ? 7 : 5
  } catch {
    return 5
  }
}

export function setHrZoneCount(n) {
  if (Number(n) === 7) localStorage.setItem(KEYS.hrZoneCount, '7')
  else localStorage.removeItem(KEYS.hrZoneCount)
}

export function getMaxHr() {
  try {
    const v = Number(localStorage.getItem(KEYS.hrMaxBpm))
    return Number.isFinite(v) && v > 0 ? v : null
  } catch {
    return null
  }
}

export function setMaxHr(bpm) {
  const v = Number(bpm)
  if (Number.isFinite(v) && v > 0) localStorage.setItem(KEYS.hrMaxBpm, String(Math.round(v)))
  else localStorage.removeItem(KEYS.hrMaxBpm)
}

// Standard ceilings for a zone count, from max HR. Null without a max HR.
export function standardHrCeilings(count, maxHr = getMaxHr()) {
  const pcts = HR_ZONE_PCTS[count]
  if (!pcts || !maxHr) return null
  return pcts.map((p) => Math.round(maxHr * p))
}

// Hand-edited ceilings, kept per zone count so switching 5↔7 loses nothing.
export function getCustomHrCeilings(count) {
  try {
    const raw = localStorage.getItem(count === 5 ? KEYS.hrZones5 : KEYS.hrZones7)
    const arr = raw ? JSON.parse(raw) : null
    const want = count - 1
    if (!Array.isArray(arr) || arr.length !== want) return null
    return arr.every((v, i) => Number.isFinite(v) && v > 0 && (i === 0 || v > arr[i - 1]))
      ? arr
      : null
  } catch {
    return null
  }
}

export function setCustomHrCeilings(count, ceilings) {
  const key = count === 5 ? KEYS.hrZones5 : KEYS.hrZones7
  if (Array.isArray(ceilings)) localStorage.setItem(key, JSON.stringify(ceilings))
  else localStorage.removeItem(key)
}

// What the analysis should use. With useIcu the rest is moot (intervals.icu's
// zones show as sent); otherwise hand-edited ceilings win over the standard
// ones, and ceilings stays null until either exists.
export function getHrZoneConfig() {
  const count = getHrZoneCount()
  const custom = getCustomHrCeilings(count)
  return {
    useIcu: getUseIcuZones(),
    count,
    maxHr: getMaxHr(),
    ceilings: custom ?? standardHrCeilings(count),
    isCustom: custom != null,
  }
}

// Emoji stand-in avatar (Profile). Used when no photo is uploaded; empty
// string means "use initials".
export function getAvatarEmoji() {
  try {
    return localStorage.getItem(KEYS.avatarEmoji) || ''
  } catch {
    return ''
  }
}

export function setAvatarEmoji(emoji) {
  if (emoji) localStorage.setItem(KEYS.avatarEmoji, emoji)
  else localStorage.removeItem(KEYS.avatarEmoji)
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
