// Small formatting + date helpers. Metric units throughout.
import {
  format,
  parseISO,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfDay,
  endOfDay,
  subDays,
  isWithinInterval,
} from 'date-fns'

// We anchor weeks to Monday (European convention).
const WEEK_OPTS = { weekStartsOn: 1 }

export function todayISO() {
  return format(new Date(), 'yyyy-MM-dd')
}

// Accepts an ISO date string ('2026-06-21') or a Date.
export function asDate(value) {
  if (value instanceof Date) return value
  // Date-only strings: parse as local midnight to avoid TZ off-by-one.
  if (typeof value === 'string' && value.length === 10) {
    const [y, m, d] = value.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  return parseISO(value)
}

export function formatDay(value) {
  return format(asDate(value), 'EEE d MMM')
}

export function formatDayShort(value) {
  return format(asDate(value), 'd MMM')
}

export function weekRange(ref = new Date()) {
  return { start: startOfWeek(ref, WEEK_OPTS), end: endOfWeek(ref, WEEK_OPTS) }
}

export function monthRange(ref = new Date()) {
  return { start: startOfMonth(ref), end: endOfMonth(ref) }
}

// Rolling window: the last n calendar days, inclusive of today.
export function lastNDaysRange(n, ref = new Date()) {
  return { start: startOfDay(subDays(ref, n - 1)), end: endOfDay(ref) }
}

export function inRange(value, range) {
  return isWithinInterval(asDate(value), range)
}

// minutes -> "1h 30m" / "45m"
export function formatDuration(minutes) {
  if (minutes == null || minutes === '') return '–'
  const m = Number(minutes)
  if (!Number.isFinite(m) || m <= 0) return '–'
  const h = Math.floor(m / 60)
  const rem = m % 60
  if (h === 0) return `${rem}m`
  if (rem === 0) return `${h}h`
  return `${h}h ${rem}m`
}

// minutes -> hours with one decimal (for summary cards)
export function toHours(minutes) {
  return Math.round(((Number(minutes) || 0) / 60) * 10) / 10
}

export function formatHours(minutes) {
  const h = toHours(minutes)
  return `${h}h`
}

// Average speed in km/h from distance (km) + duration (min), 1 decimal.
export function avgSpeedFrom(distanceKm, minutes) {
  const d = Number(distanceKm)
  const m = Number(minutes)
  if (!d || !m) return ''
  return Math.round((d / (m / 60)) * 10) / 10
}

// "m:ss" from a seconds value (e.g. a pace). null if not computable.
function fmtPace(secs) {
  if (!Number.isFinite(secs) || secs <= 0) return null
  const m = Math.floor(secs / 60)
  const s = Math.round(secs % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

// Running pace as "m:ss" per km from distance (km) + duration (min).
export function pacePerKm(distanceKm, minutes) {
  const d = Number(distanceKm)
  const m = Number(minutes)
  if (!d || !m) return null
  return fmtPace((m * 60) / d)
}

// Swim pace as "m:ss" per 100 m from distance (m) + duration (min).
export function pacePer100m(distanceM, minutes) {
  const d = Number(distanceM)
  const m = Number(minutes)
  if (!d || !m) return null
  return fmtPace((m * 60) / (d / 100))
}
