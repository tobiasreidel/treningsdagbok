// Your settings, owned by the account rather than the browser. Every
// preference here is a row in public.user_prefs (see
// supabase/migrations/20260730000000_user_prefs.sql), so a choice made on the
// phone is the same choice on the laptop.
//
// localStorage still holds a copy, keyed by user id, and that copy is what the
// getters below read. They stay synchronous because half the app reads a
// preference while rendering and because the first paint must not wait for a
// round-trip: the copy is filled from the server at sign-in (loadPrefs, which
// AuthContext awaits before the app renders) and written through on every
// change. The server is the source of truth; the copy never is.
//
// A change made offline stays in `pending` and is pushed on the next load or
// when the browser comes back online, so a setting toggled on a train is not
// quietly lost.
import { supabase, isConfigured, isMissingTable } from './supabase'
import { fetchCoachProfile } from './coachProfile'

// Setting names, as stored in user_prefs.key.
const KEYS = {
  theme: 'theme',
  hideRidesUnderKm: 'hideRidesUnderKm',
  enabledSports: 'enabledSports',
  onboarded: 'onboarded',
  dashboardWidgets: 'dashboardWidgets',
  logPeriod: 'logPeriod',
  avatarEmoji: 'avatarEmoji',
  hrZoneCount: 'hrZoneCount',
  hrMaxBpm: 'hrMaxBpm',
  hrZones5: 'hrZones5',
  hrZones7: 'hrZones7',
  hrUseIcu: 'hrUseIcuZones',
  gearSports: 'gearSports',
  coach: 'coach',
  coachModel: 'coachModel',
  coachPick: 'coachPick',
  checkinPromptDay: 'checkinPromptDay',
  bodyweight: 'bodyweight',
}

// Kept out of user_prefs: bodyweight is a mirror of
// coach_profile.bodyweight_kg, refilled from that row at sign-in. The profile
// stays the one place a bodyweight is stored, and a second copy on the server
// is a second thing to keep in step.
const LOCAL_ONLY = new Set([KEYS.bodyweight])

const CACHE_PREFIX = 'prefs.cache.' // + user id
const PENDING_PREFIX = 'prefs.pending.' // + user id
const LAST_USER = 'prefs.lastUser'

let userId = null
let values = {}
// Keys written locally that the server has not confirmed. On a merge these
// beat the server copy: they are the newer value, they just could not be sent.
let pending = new Set()

// ---- storage ---------------------------------------------------------------

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    const parsed = raw ? JSON.parse(raw) : null
    return parsed ?? fallback
  } catch {
    return fallback
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage full or blocked. The values stay in memory for this session and
    // the server still gets them; only the offline copy is lost.
  }
}

function persist() {
  if (!userId) return
  writeJson(CACHE_PREFIX + userId, values)
  writeJson(PENDING_PREFIX + userId, [...pending])
}

// Point the module at a user and load their copy. Synchronous, so the getters
// are answering for the right person the moment a session is known.
function adopt(id) {
  userId = id || null
  values = userId ? readJson(CACHE_PREFIX + userId, {}) : {}
  pending = new Set(userId ? readJson(PENDING_PREFIX + userId, []) : [])
  if (userId) {
    try {
      localStorage.setItem(LAST_USER, userId)
    } catch {
      /* ignore */
    }
  }
}

// Whoever was signed in last on this device. Read at import so the theme and
// the rest are already right during the first paint, before auth has answered.
const lastUser = (() => {
  try {
    return localStorage.getItem(LAST_USER) || null
  } catch {
    return null
  }
})()

adopt(lastUser)

// ---- read / write ----------------------------------------------------------

// The stored value for a setting, or `fallback` when it has never been set.
// Null is stored to mean "back to the default", so it reads as absent too.
export function getPref(key, fallback = null) {
  const v = values[key]
  return v === undefined || v === null ? fallback : v
}

// Set a value (null clears it), everywhere: memory, the offline copy, and the
// server. The server write is not awaited - a preference toggle must feel
// instant, and a failed write stays pending rather than being lost.
export function setPref(key, value) {
  if (value === undefined || value === null) values[key] = null
  else values[key] = value
  if (!LOCAL_ONLY.has(key)) pending.add(key)
  persist()
  window.dispatchEvent(new Event('prefs:changed'))
  if (!LOCAL_ONLY.has(key)) push(key)
}

async function push(key) {
  if (!isConfigured || !userId) return
  const value = values[key] ?? null
  try {
    const { error } = await supabase
      .from('user_prefs')
      .upsert(
        { user_id: userId, key, value, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,key' },
      )
    if (error) throw error
    pending.delete(key)
    persist()
  } catch {
    // Offline, or the migration has not been run yet. Stays pending.
  }
}

// Push everything still waiting. Called after a load and whenever the browser
// comes back online (App.jsx).
export async function flushPrefs() {
  if (!isConfigured || !userId || !pending.size) return
  await Promise.all([...pending].map((key) => push(key)))
}

// ---- boot ------------------------------------------------------------------

// Fill the copy from the server for `id`. Awaited before the app renders, so
// every getter above is answering with this account's real settings rather
// than defaults that would then change under the user.
//
// Failure is not an error state: an offline launch, or an install where the
// migration has not been run, keeps using the local copy and carries on.
export async function loadPrefs(id) {
  adopt(id)
  if (!id || !isConfigured) return
  const [rows, profile] = await Promise.all([
    supabase
      .from('user_prefs')
      .select('key, value')
      .then(({ data, error }) => {
        if (error) throw error
        return data || []
      })
      .catch((err) => (isMissingTable(err) ? [] : null)),
    fetchCoachProfile().catch(() => null),
  ])

  if (rows) {
    for (const row of rows) {
      // A local change that never reached the server is newer than what the
      // server has; leave it alone and let the flush below send it.
      if (pending.has(row.key)) continue
      values[row.key] = row.value ?? null
    }
    liftLegacy(rows)
  }

  // The session form needs a bodyweight to show total hangboard load, and on a
  // new device there is no local mirror to read. The profile has one.
  const kg = Number(profile?.bodyweight_kg)
  if (Number.isFinite(kg) && kg > 0) values[KEYS.bodyweight] = kg

  persist()
  window.dispatchEvent(new Event('prefs:changed'))
  await flushPrefs()
  // Everything is on the server now, so the pre-account copies are redundant.
  // Only once nothing is still waiting to be sent: until then they are the
  // last copy of a setting that has not landed anywhere yet.
  if (rows && !pending.size) sweepLegacy()
}

// Signed out: stop answering with the previous account's settings. The copy on
// disk is left alone, keyed by their id, so signing back in on this device is
// instant and works offline.
export function forgetPrefs() {
  adopt(null)
}

// Who the loaded settings belong to. AuthContext uses this to tell "a token
// refreshed" from "a different person signed in".
export function prefsUserId() {
  return userId
}

// ---- the one-time lift from localStorage -----------------------------------
// Before this, every setting lived in a `pref.*` key shared by every account on
// the browser. The first sign-in after the change carries them up to the
// account so nobody's app resets itself.
//
// Only the first user to sign in after the upgrade gets them: the keys were
// shared, so there is no way to tell whose they were, and handing one person's
// settings to the next account on a shared browser is worse than a reset.
const LEGACY = {
  'pref.theme': [KEYS.theme, (s) => s],
  'pref.hideRidesUnderKm': [KEYS.hideRidesUnderKm, (s) => Number(s) || null],
  'pref.enabledSports': [KEYS.enabledSports, JSON.parse],
  'pref.dashboardWidgets': [KEYS.dashboardWidgets, JSON.parse],
  'pref.logPeriod': [KEYS.logPeriod, (s) => s === '1'],
  'pref.avatarEmoji': [KEYS.avatarEmoji, (s) => s],
  'pref.hrZoneCount': [KEYS.hrZoneCount, (s) => Number(s) || null],
  'pref.hrMaxBpm': [KEYS.hrMaxBpm, (s) => Number(s) || null],
  'pref.hrZones5': [KEYS.hrZones5, JSON.parse],
  'pref.hrZones7': [KEYS.hrZones7, JSON.parse],
  'pref.hrUseIcuZones': [KEYS.hrUseIcu, (s) => s !== '0'],
  'pref.gearSports': [KEYS.gearSports, JSON.parse],
  'pref.coach': [KEYS.coach, (s) => s === '1'],
  'pref.coachModel': [KEYS.coachModel, (s) => s],
  'pref.bodyweightKg': [KEYS.bodyweight, (s) => Number(s) || null],
}

// True only when this device has never run the account-backed version, decided
// at import before the first adopt() writes LAST_USER.
const canLift = lastUser === null

function liftLegacy(serverRows) {
  if (!canLift) return
  // Anything already on the server wins: this device is late to the party.
  const known = new Set(serverRows.map((r) => r.key))
  let lifted = false
  for (const [oldKey, [key, parse]] of Object.entries(LEGACY)) {
    if (known.has(key)) continue
    let raw = null
    try {
      raw = localStorage.getItem(oldKey)
    } catch {
      return
    }
    if (raw == null) continue
    try {
      const value = parse(raw)
      if (value === null || value === undefined) continue
      values[key] = value
      if (!LOCAL_ONLY.has(key)) pending.add(key)
      lifted = true
    } catch {
      // Unreadable leftover: the default is a better answer than a crash.
    }
  }
  // Onboarding used to be a list of user ids on the device.
  if (!known.has(KEYS.onboarded) && readJson('pref.onboardedUsers', []).includes(userId)) {
    values[KEYS.onboarded] = true
    pending.add(KEYS.onboarded)
    lifted = true
  }
  // The old keys stay put for now: until the push lands they are the only copy
  // of these settings. sweepLegacy clears them once it has.
  if (lifted) persist()
}

// Keys the pre-account version wrote, including the two that are not worth
// carrying up: a day-scoped session pick and yesterday's check-in prompt.
const LEGACY_KEYS = [...Object.keys(LEGACY), 'pref.onboardedUsers', 'pref.coachPick', 'pref.checkinPromptDay']

// Drop them. Called only with every setting confirmed on the server, so this
// removes copies, never the last copy of anything.
function sweepLegacy() {
  try {
    for (const key of LEGACY_KEYS) localStorage.removeItem(key)
  } catch {
    // Blocked storage. They are harmless where they are.
  }
}

// A local mirror of coach_profile.bodyweight_kg, written when the profile is
// saved and refilled from the profile at sign-in. The session form needs it to
// render "total load" helper text without a server round-trip on every
// keystroke; the profile row remains the source of truth for anything the
// coach computes.
//
// One value, no history, deliberately: see supabase/migrations/20260727000000_coach_v4.sql for why a
// bodyweight *trend* is a feature this app does not build.
export function getBodyweight() {
  const v = Number(getPref(KEYS.bodyweight))
  return Number.isFinite(v) && v > 0 ? v : null
}

export function setBodyweight(kg) {
  const v = Number(kg)
  setPref(KEYS.bodyweight, Number.isFinite(v) && v > 0 ? v : null)
}

// ---- training coach (Settings → Training coach) ----------------------------
// Off by default. When on, the dashboard shows a finger-recovery status and a
// suggestion for today, derived from the sessions you already log. Purely an
// awareness aid - see src/lib/coach.js.
export function getCoachEnabled() {
  return getPref(KEYS.coach) === true
}

export function setCoachEnabled(on) {
  setPref(KEYS.coach, on ? true : null)
}

// The last day the daily check-in sheet was shown (saved or dismissed). One
// prompt per day: dismissing it must not mean being nagged again an hour
// later, and the sheet can still be reached any time via the check-in page.
export function getCheckinPromptDay() {
  return getPref(KEYS.checkinPromptDay, '')
}

export function setCheckinPromptDay(iso) {
  setPref(KEYS.checkinPromptDay, iso || null)
}

// Periodisation model the session generator follows. No climbing study shows
// one model beating another, so this is a preference, not a recommendation -
// variation and sticking with it matter more than the choice.
export function getCoachModel() {
  return getPref(KEYS.coachModel) === 'linear' ? 'linear' : 'undulating'
}

export function setCoachModel(key) {
  setPref(KEYS.coachModel, key === 'linear' ? 'linear' : null)
}

// Which of "Sessions that fit" you picked for today, when you didn't want the
// coach's first choice. Scoped to a single day on purpose: the point is "not
// that one, today", not a standing preference the plan should learn from -
// letting it persist would quietly turn the rotation into a rut. An id that
// isn't in today's list is ignored (see suggestSession), so a stale pick can
// never resurrect yesterday's session.
export function getSessionPick(day) {
  const saved = getPref(KEYS.coachPick)
  return saved?.day === day ? saved.id : null
}

export function setSessionPick(day, id) {
  setPref(KEYS.coachPick, id ? { day, id } : null)
}

// ---- gear logging (Settings → Gear, logging on Profile) --------------------
// Per-sport and independent: tracking climbing shoe wear says nothing about
// wanting bike maintenance logs. All off by default.
export const GEAR_SPORTS = ['cycling', 'running', 'climbing']

export function getGearSports() {
  const saved = getPref(KEYS.gearSports)
  return GEAR_SPORTS.filter((k) => Array.isArray(saved) && saved.includes(k))
}

export function setGearSports(keys) {
  const kept = GEAR_SPORTS.filter((k) => keys.includes(k))
  setPref(KEYS.gearSports, kept.length ? kept : null)
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
  return getPref(KEYS.hrUseIcu, true) !== false
}

export function setUseIcuZones(on) {
  setPref(KEYS.hrUseIcu, on ? null : false)
}

// How many zones the app's own model uses. 5 is the standard.
export function getHrZoneCount() {
  return getPref(KEYS.hrZoneCount) === 7 ? 7 : 5
}

export function setHrZoneCount(n) {
  setPref(KEYS.hrZoneCount, Number(n) === 7 ? 7 : null)
}

export function getMaxHr() {
  const v = Number(getPref(KEYS.hrMaxBpm))
  return Number.isFinite(v) && v > 0 ? v : null
}

export function setMaxHr(bpm) {
  const v = Number(bpm)
  setPref(KEYS.hrMaxBpm, Number.isFinite(v) && v > 0 ? Math.round(v) : null)
}

// Standard ceilings for a zone count, from max HR. Null without a max HR.
export function standardHrCeilings(count, maxHr = getMaxHr()) {
  const pcts = HR_ZONE_PCTS[count]
  if (!pcts || !maxHr) return null
  return pcts.map((p) => Math.round(maxHr * p))
}

// Hand-edited ceilings, kept per zone count so switching 5↔7 loses nothing.
export function getCustomHrCeilings(count) {
  const arr = getPref(count === 5 ? KEYS.hrZones5 : KEYS.hrZones7)
  const want = count - 1
  if (!Array.isArray(arr) || arr.length !== want) return null
  return arr.every((v, i) => Number.isFinite(v) && v > 0 && (i === 0 || v > arr[i - 1]))
    ? arr
    : null
}

export function setCustomHrCeilings(count, ceilings) {
  setPref(count === 5 ? KEYS.hrZones5 : KEYS.hrZones7, Array.isArray(ceilings) ? ceilings : null)
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
  return getPref(KEYS.avatarEmoji, '')
}

export function setAvatarEmoji(emoji) {
  setPref(KEYS.avatarEmoji, emoji || null)
}

// Period tracking (Settings → Health). Off by default; turning it on adds
// period logging to the calendar and the cycle card to the dashboard. The
// logged days themselves live on the server (owner-only via RLS).
export function getLogPeriod() {
  return getPref(KEYS.logPeriod) === true
}

export function setLogPeriod(on) {
  setPref(KEYS.logPeriod, on ? true : null)
}

// Sports the user currently tracks. Disabling one hides it from logging and
// the aggregate views (cards, stats) - but never touches stored sessions, so
// past sessions of a disabled sport still show in the calendar and history.
export const ALL_SPORTS = ['cycling', 'running', 'swimming', 'climbing', 'strength', 'finger']

export function getEnabledSports() {
  const saved = getPref(KEYS.enabledSports)
  if (!Array.isArray(saved)) return [...ALL_SPORTS]
  const kept = ALL_SPORTS.filter((k) => saved.includes(k))
  // Never end up with zero sports - fall back to all if the list is empty.
  return kept.length ? kept : [...ALL_SPORTS]
}

export function setEnabledSports(keys) {
  const kept = ALL_SPORTS.filter((k) => keys.includes(k))
  setPref(KEYS.enabledSports, kept.length ? kept : ALL_SPORTS)
}

// First-run onboarding: a new user picks their sports before reaching the app.
// A flag on the account, so signing in on a second device does not walk you
// through the picker again for sports you have already chosen.
export function isOnboarded() {
  if (!userId) return true // nothing to gate on until we know who's signed in
  return getPref(KEYS.onboarded) === true
}

export function setOnboarded() {
  setPref(KEYS.onboarded, true)
}

// Dashboard widgets the user has placed on the front page, in display order.
// Unlike the per-sport totals of old, what shows is now purely the user's
// choice (see src/components/DashboardWidgets.jsx for the catalog). An empty
// list is valid (the user removed everything); only a missing value falls back
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
  const saved = getPref(KEYS.dashboardWidgets)
  return Array.isArray(saved) ? saved : [...DEFAULT_WIDGETS]
}

// An empty list is a real choice, so it is stored as [] rather than cleared.
export function setDashboardWidgets(ids) {
  setPref(KEYS.dashboardWidgets, Array.isArray(ids) ? ids : [])
}

// Minimum cycling distance (km) to show in the dashboard's "Last 7 days" list.
// 0 (or unset) means show everything. Used to hide short commutes.
export function getHideRidesUnderKm() {
  const v = Number(getPref(KEYS.hideRidesUnderKm))
  return Number.isFinite(v) && v > 0 ? v : 0
}

export function setHideRidesUnderKm(km) {
  const v = Number(km)
  setPref(KEYS.hideRidesUnderKm, Number.isFinite(v) && v > 0 ? v : null)
}
