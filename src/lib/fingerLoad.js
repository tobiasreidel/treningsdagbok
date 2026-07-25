// Finger-load arithmetic: the one place that knows what a hangboard number
// means.
//
// THE CONVENTION
// --------------
// All finger intensity is a percentage of TOTAL load — bodyweight included —
// never of added weight.
//
// Why this is not a detail. Bodyweight is the dominant term, so a percentage
// of *added* weight is close to 100% of actual tissue load. A 60 kg climber
// whose max 10 s hang is 65 kg total (i.e. +5 kg added):
//
//   "85% of 1RM" read as added weight  → +4.25 kg → 64.25 kg → 98.8% of max
//   "85% of 1RM" read as total load    → 55.3 kg  → 5 kg ASSISTED
//
// Two completely different sessions from the same instruction, and the error
// is largest for exactly the climbers least able to absorb it — anyone whose
// added weight is a small fraction of bodyweight.
//
// MIGRATION STATE
// ---------------
// Both of this app's existing stores are ADDED weight, and we know it rather
// than infer it: supabase/coach.sql documents `hang_max_kg` as "Added kg for a
// 7-10 s two-hand hang", the setup form labels it "Added weight", and the
// session logger's own hint said "Weight: added weight". So legacy rows are
// unambiguous and need no guessing heuristic — they need a bodyweight to be
// converted with, and until one exists the app must say the number is not yet
// usable rather than quietly prescribing off the wrong denominator.
import { differenceInCalendarDays } from 'date-fns'
import { asDate } from './format'
import { normalizeHang } from './formState'

const num = (v) => Number(v) || 0

// Two-arm hanging yields somewhat less than the sum of one-arm maxima. Chosen
// coefficient, not measured — exposed so it can be tuned rather than buried.
export const BILATERAL_FACTOR = 0.93

// Grips the library and the test battery both understand.
export const GRIPS = [
  { key: 'halfcrimp', label: 'Half-crimp' },
  { key: 'open3', label: 'Three-finger open' },
  { key: 'open4', label: 'Four-finger open' },
  { key: 'fullcrimp', label: 'Full crimp' },
  { key: 'pinch', label: 'Pinch' },
]

export function gripLabel(key) {
  return GRIPS.find((g) => g.key === key)?.label || key
}

export const HANG_PROTOCOLS = [
  {
    key: 'total_load',
    label: 'Max total load',
    unit: 'kg',
    hint: 'The most you can hold for ~10 s on a fixed edge, bodyweight included.',
  },
  {
    key: 'min_edge',
    label: 'Minimum edge',
    unit: 'mm',
    hint: 'The smallest edge you can hold for ~10 s at bodyweight. Needs no bodyweight figure at all.',
  },
]

// ---------------------------------------------------------------------------
// resolving a max
// ---------------------------------------------------------------------------

const STALE_WEEKS = 16
const WARN_WEEKS = 8

function testAgeWeeks(dateISO) {
  if (!dateISO) return null
  return Math.floor(differenceInCalendarDays(new Date(), asDate(dateISO)) / 7)
}

// The best usable max TOTAL load for a grip, newest test first.
//
// Returns { kg, grip, edge_mm, weeks, stale, warn, source, derived } or a
// reason why there isn't one. `derived` means it was reconstructed from a
// legacy added-weight figure plus a bodyweight, which is an approximation:
// the bodyweight is today's, not the bodyweight at the test.
export function maxTotalFor(profile, tests = [], grip = 'halfcrimp') {
  const rows = (tests || [])
    .filter((t) => t.protocol === 'total_load' && t.value > 0 && !t.aborted_reason)
    .sort((a, b) => String(b.tested_on).localeCompare(String(a.tested_on)))

  // Exact grip first, then any grip (and say which, so the UI can caveat it).
  const exact = rows.find((t) => t.grip === grip && t.hands === 'two')
  const anyTwo = rows.find((t) => t.hands === 'two')
  // One-hand pair → estimated two-hand max.
  const oneHand = rows.find((t) => t.hands === 'one' && t.value_left > 0)

  const pick = exact || anyTwo
  if (pick) {
    const weeks = testAgeWeeks(pick.tested_on)
    return {
      kg: Number(pick.value),
      grip: pick.grip,
      edge_mm: pick.edge_mm ?? null,
      weeks,
      warn: weeks != null && weeks >= WARN_WEEKS,
      stale: weeks != null && weeks >= STALE_WEEKS,
      source: 'test',
      exactGrip: !!exact,
      derived: false,
    }
  }

  if (oneHand) {
    const weeks = testAgeWeeks(oneHand.tested_on)
    return {
      kg: (Number(oneHand.value) + Number(oneHand.value_left)) * BILATERAL_FACTOR,
      grip: oneHand.grip,
      edge_mm: oneHand.edge_mm ?? null,
      weeks,
      warn: weeks != null && weeks >= WARN_WEEKS,
      stale: weeks != null && weeks >= STALE_WEEKS,
      source: 'one-hand-pair',
      exactGrip: oneHand.grip === grip,
      derived: true,
    }
  }

  // Legacy: coach_profile.hang_max_kg is ADDED weight (see file header).
  const legacyAdded = num(profile?.hang_max_kg)
  if (legacyAdded > 0) {
    const bw = num(profile?.bodyweight_kg)
    const weeks = testAgeWeeks(profile?.hang_tested_on)
    if (!(bw > 0)) {
      // Deliberately refuse rather than prescribe off the wrong denominator.
      return {
        kg: null,
        reason: 'needs-bodyweight',
        legacyAdded,
        source: 'legacy',
      }
    }
    return {
      kg: bw + legacyAdded,
      grip: 'halfcrimp',
      edge_mm: profile?.hang_edge_mm ?? null,
      weeks,
      warn: weeks != null && weeks >= WARN_WEEKS,
      stale: weeks != null && weeks >= STALE_WEEKS,
      source: 'legacy',
      exactGrip: grip === 'halfcrimp',
      derived: true,
    }
  }

  return { kg: null, reason: 'no-test' }
}

// Usable as a prescription reference right now? A clearly stale test is not.
export function usableMaxTotal(profile, tests, grip) {
  const m = maxTotalFor(profile, tests, grip)
  if (!m.kg || m.stale) return null
  return m.kg
}

// The minimum-edge protocol needs no bodyweight: prescribe in millimetres.
export function minEdgeFor(tests = [], grip = 'halfcrimp') {
  const rows = (tests || [])
    .filter((t) => t.protocol === 'min_edge' && t.value > 0 && !t.aborted_reason)
    .sort((a, b) => String(b.tested_on).localeCompare(String(a.tested_on)))
  const pick = rows.find((t) => t.grip === grip) || rows[0]
  if (!pick) return null
  const weeks = testAgeWeeks(pick.tested_on)
  return {
    mm: Number(pick.value),
    grip: pick.grip,
    weeks,
    stale: weeks != null && weeks >= STALE_WEEKS,
  }
}

// ---------------------------------------------------------------------------
// prescribing
// ---------------------------------------------------------------------------

// Turn "80-90% of max" into something an athlete can set up on a hangboard.
//
// Negative added weight is the NORMAL case for submaximal finger work, not an
// error: it means assisted, via pulley, band, or feet on the floor. Clamping
// it to bodyweight (or hiding it) is a large part of why every finger session
// in a naive library ends up near-maximal.
export function prescribeHang({ lo, hi }, maxTotal, bodyweight) {
  if (!(maxTotal > 0)) return null
  const loTotal = lo * maxTotal
  const hiTotal = hi * maxTotal
  const out = {
    pctText: `${Math.round(lo * 100)}–${Math.round(hi * 100)}%`,
    totalText:
      Math.round(loTotal) === Math.round(hiTotal)
        ? `${Math.round(loTotal)} kg total`
        : `${Math.round(loTotal)}–${Math.round(hiTotal)} kg total`,
    loTotal,
    hiTotal,
  }
  if (!(bodyweight > 0)) return out

  const loAdded = loTotal - bodyweight
  const hiAdded = hiTotal - bodyweight
  out.loAdded = loAdded
  out.hiAdded = hiAdded
  out.assisted = hiAdded < 0
  const fmt = (v) => `${v > 0 ? '+' : ''}${Math.round(v)}`
  if (hiAdded < 0) {
    // Fully assisted across the range: express it as weight taken off.
    out.addedText =
      Math.round(loAdded) === Math.round(hiAdded)
        ? `${Math.abs(Math.round(loAdded))} kg assisted`
        : `${Math.abs(Math.round(hiAdded))}–${Math.abs(Math.round(loAdded))} kg assisted`
  } else if (loAdded < 0) {
    out.addedText = `${Math.abs(Math.round(loAdded))} kg assisted → ${fmt(hiAdded)} kg added`
  } else {
    out.addedText =
      Math.round(loAdded) === Math.round(hiAdded)
        ? `${fmt(loAdded)} kg added`
        : `${fmt(loAdded)}–${fmt(hiAdded)} kg added`
  }
  return out
}

// ---------------------------------------------------------------------------
// reading a logged set
// ---------------------------------------------------------------------------

// Total load a logged hangboard set put through the fingers.
//
//   v4 rows carry `load_total_kg` directly.
//   Legacy rows carry `weight` = ADDED kg, which needs a bodyweight to become
//   comparable. Without one we return null rather than pretending.
export function setTotalLoad(set, bodyweight) {
  const total = Number(set?.load_total_kg)
  if (Number.isFinite(total) && total > 0) return { kg: total, derived: false }
  const added = Number(set?.weight)
  if (!Number.isFinite(added)) return { kg: null, derived: false }
  const bw = num(bodyweight)
  if (!(bw > 0)) return { kg: null, derived: false, reason: 'needs-bodyweight' }
  // Legacy added weight; one-hand sets may be negative (assisted).
  return { kg: bw + added, derived: true }
}

// Relative intensity of a set against a max total load, 0..1.3.
export function setIntensity(set, maxTotal, bodyweight) {
  const { kg } = setTotalLoad(set, bodyweight)
  if (!(kg > 0) || !(maxTotal > 0)) return null
  return Math.max(0, Math.min(1.3, kg / maxTotal))
}

// Does this session log contain any hangboard set the app cannot interpret?
// Used to prompt for a bodyweight rather than silently mis-dosing.
export function hasUnreadableHangs(session, bodyweight) {
  for (const h of session?.extra?.finger?.hangboard || []) {
    for (const set of normalizeHang(h).sets) {
      if (setTotalLoad(set, bodyweight).reason === 'needs-bodyweight') return true
    }
  }
  return false
}
