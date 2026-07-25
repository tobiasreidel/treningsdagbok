// Finger tests and the wider physical test battery (see supabase/coach_v4.sql).
//
// Both degrade to [] when the migration hasn't been run, like every other coach
// table, so the app keeps working and the setup screen says what to run.
import { supabase } from './supabase'
import { notifyCoachChanged } from './coachProfile'

function isMissingTable(err) {
  // PostgREST reports a missing table as PGRST205, not Postgres's own 42P01.
  // Never matched on message text: PGRST204 (missing *column*) is phrased
  // almost identically and telling someone to re-run a migration they already
  // ran is worse than saying nothing.
  return err?.code === 'PGRST205' || err?.code === '42P01'
}

async function uid() {
  const { data } = await supabase.auth.getSession()
  return data?.session?.user?.id ?? null
}

// ---- finger tests ----------------------------------------------------------

export async function fetchFingerTests() {
  const { data, error } = await supabase
    .from('finger_tests')
    .select('*')
    .order('tested_on', { ascending: false })
  if (error) {
    if (isMissingTable(error)) return []
    throw error
  }
  return data || []
}

export async function addFingerTest(row) {
  const userId = await uid()
  if (!userId) throw new Error('Not signed in')
  const { error } = await supabase.from('finger_tests').insert({ ...row, user_id: userId })
  if (error) {
    if (isMissingTable(error)) {
      const e = new Error('Run supabase/coach_v4.sql to enable finger tests.')
      e.code = 'no-table'
      throw e
    }
    throw error
  }
  notifyCoachChanged()
}

export async function deleteFingerTest(id) {
  const { error } = await supabase.from('finger_tests').delete().eq('id', id)
  if (error) throw error
  notifyCoachChanged()
}

// ---- the wider battery -----------------------------------------------------
// The Norwegian Climbing Federation's test battery, as a supplement to the
// development ladder: measure capacity, find weaknesses, track progress.
export const TEST_BATTERY = [
  { id: 'half_crimp', label: 'Half-crimp max', unit: 'kg', group: 'finger', bilateral: true },
  { id: 'open_3', label: 'Three-finger open max', unit: 'kg', group: 'finger', bilateral: true },
  { id: 'pinch', label: 'Pinch', unit: 'kg', group: 'finger', bilateral: true },
  { id: 'max_hang', label: 'Max hang (total load)', unit: 'kg', group: 'finger' },
  { id: 'hang_time', label: 'Hang time at bodyweight', unit: 's', group: 'finger' },
  { id: 'weighted_pullup', label: 'Weighted pull-up (1RM)', unit: 'kg', group: 'strength' },
  { id: 'lock_off', label: 'Lock-off hold', unit: 's', group: 'strength', bilateral: true },
  { id: 'front_lever', label: 'Front lever', unit: 's', group: 'strength' },
  { id: 'l_sit', label: 'L-sit', unit: 's', group: 'strength' },
  { id: 'toes_to_bar', label: 'Toes to bar', unit: 'reps', group: 'strength' },
  { id: 'pushups', label: 'Push-ups', unit: 'reps', group: 'strength' },
  { id: 'sargent', label: 'Sargent jump', unit: 'cm', group: 'power', normalise: 'height' },
  { id: 'standing_long_jump', label: 'Standing long jump', unit: 'cm', group: 'power', normalise: 'height' },
  { id: 'split_to_wall', label: 'Split to wall', unit: 'cm', group: 'mobility', normalise: 'height' },
  { id: 'hamstring', label: 'Hamstring reach', unit: 'cm', group: 'mobility', normalise: 'height' },
  { id: 'shoulder_mobility', label: 'Shoulder mobility', unit: 'cm', group: 'mobility', bilateral: true },
  { id: 'high_step', label: 'High step', unit: 'cm', group: 'mobility', normalise: 'height', bilateral: true },
  { id: 'single_leg_squat', label: 'Single-leg squat', unit: 'reps', group: 'mobility', bilateral: true },
]

export function testMeta(id) {
  return TEST_BATTERY.find((t) => t.id === id) || { id, label: id, unit: '' }
}

export async function fetchPhysicalTests() {
  const { data, error } = await supabase
    .from('physical_tests')
    .select('*')
    .order('tested_on', { ascending: false })
  if (error) {
    if (isMissingTable(error)) return []
    throw error
  }
  return data || []
}

export async function addPhysicalTest(row) {
  const userId = await uid()
  if (!userId) throw new Error('Not signed in')
  const { error } = await supabase.from('physical_tests').insert({ ...row, user_id: userId })
  if (error) {
    if (isMissingTable(error)) {
      const e = new Error('Run supabase/coach_v4.sql to enable the test battery.')
      e.code = 'no-table'
      throw e
    }
    throw error
  }
  notifyCoachChanged()
}

// ---- asymmetry -------------------------------------------------------------

// A persistent side-to-side deficit is one of the patterns the battery exists
// to surface. 10% is a chosen threshold, not a clinical one, and the app says
// so: this is a training observation, never a diagnosis.
export const ASYMMETRY_THRESHOLD = 0.1

export function asymmetries(fingerTests = [], physicalTests = []) {
  const out = []

  for (const t of fingerTests) {
    if (t.hands !== 'one' || t.aborted_reason) continue
    const r = Number(t.value)
    const l = Number(t.value_left)
    if (!(r > 0) || !(l > 0)) continue
    const diff = Math.abs(r - l) / Math.max(r, l)
    if (diff > ASYMMETRY_THRESHOLD) {
      out.push({
        test: `${t.grip} hang`,
        pct: Math.round(diff * 100),
        strong: r >= l ? 'right' : 'left',
        date: t.tested_on,
      })
    }
  }

  // Bilateral battery entries: newest pair per test id.
  const byTest = new Map()
  for (const t of physicalTests) {
    if (!t.side || t.aborted_reason) continue
    const k = t.test_id
    if (!byTest.has(k)) byTest.set(k, {})
    const slot = byTest.get(k)
    if (!slot[t.side]) slot[t.side] = t
  }
  for (const [id, pair] of byTest) {
    const r = Number(pair.R?.value)
    const l = Number(pair.L?.value)
    if (!(r > 0) || !(l > 0)) continue
    const diff = Math.abs(r - l) / Math.max(r, l)
    if (diff > ASYMMETRY_THRESHOLD) {
      out.push({
        test: testMeta(id).label,
        pct: Math.round(diff * 100),
        strong: r >= l ? 'right' : 'left',
        date: pair.R.tested_on,
      })
    }
  }

  return out.sort((a, b) => b.pct - a.pct)
}

// Tests abandoned because of pain, in the last `days` days. These are events,
// not missing values: the caller raises them into the coach's problem list so
// the decision tree treats them like any other reported problem.
export function painAborts(fingerTests = [], physicalTests = [], days = 28) {
  const cut = new Date()
  cut.setDate(cut.getDate() - days)
  const cutISO = cut.toISOString().slice(0, 10)
  const rows = [
    ...fingerTests.map((t) => ({ ...t, area: 'fingers', label: `${t.grip} test` })),
    ...physicalTests.map((t) => ({
      ...t,
      area: testMeta(t.test_id).group === 'finger' ? 'fingers' : 'other',
      label: testMeta(t.test_id).label,
    })),
  ]
  return rows.filter((t) => t.aborted_reason === 'pain' && t.tested_on >= cutISO)
}
