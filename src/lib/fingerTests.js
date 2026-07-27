// Finger tests and the wider physical test battery (see supabase/coach_v4.sql).
//
// Both degrade to [] when the migration hasn't been run, like every other coach
// table, so the app keeps working and the setup screen says what to run.
import { supabase, currentUserId, isMissingTable } from './supabase'
import { notifyCoachChanged } from './coachProfile'

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
  const userId = await currentUserId()
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
export const TEST_GROUPS = [
  { key: 'finger', label: '🤏 Fingers' },
  { key: 'strength', label: '💪 Strength' },
  { key: 'power', label: '⚡ Power' },
  { key: 'mobility', label: '🧘 Mobility' },
]

// `how` is how to run each test, and `why` what a number in it tells you. Both
// exist because a test you perform slightly differently each time measures
// nothing: the value of a battery is the comparison with the last one, and
// that only holds if the protocol holds. Written as this app measures them -
// close to the federation's descriptions, but the wording is ours, so follow
// what it says here and your own numbers stay comparable.
export const TEST_BATTERY = [
  {
    id: 'half_crimp',
    label: 'Half-crimp max',
    unit: 'kg',
    group: 'finger',
    bilateral: true,
    how: 'One hand on a 20 mm edge, fingers at about 90° at the middle knuckle, thumb off. Pull for 5 seconds and record the highest force. Rest 2–3 min between attempts, three attempts per hand, best one counts.',
    why: 'The grip most climbing loads run through, and the one most worth tracking. A gap between hands is worth more attention than the number itself.',
  },
  {
    id: 'open_3',
    label: 'Three-finger open max',
    unit: 'kg',
    group: 'finger',
    bilateral: true,
    how: 'Index, middle and ring on a 20 mm edge, fingers open — no bend at the last knuckle, thumb off. Same protocol: 5 s pull, best of three per hand.',
    why: 'Open-hand strength carries slopers and pockets, and is the grip that usually lags when everything is trained in a crimp.',
  },
  {
    id: 'pinch',
    label: 'Pinch',
    unit: 'kg',
    group: 'finger',
    bilateral: true,
    how: 'Lift a pinch block with the thumb opposed to the fingers, arm straight down at your side. Add weight until you can hold it 5 seconds. Record the total lifted, per hand.',
    why: 'Thumb strength is trained almost nowhere by accident, so a weak pinch usually means it has never been asked for.',
  },
  {
    id: 'max_hang',
    label: 'Max hang (total load)',
    unit: 'kg',
    group: 'finger',
    how: 'Two hands, 20 mm edge, half-crimp. Find the load you can hang for exactly 10 seconds — add weight, or take it off with a pulley or feet on the floor. Record bodyweight plus what you added, or minus what you took off.',
    why: 'This is the number the coach prescribes hangboard sessions from. Everything written as “80–90% of max” means 80–90% of this.',
  },
  {
    id: 'hang_time',
    label: 'Hang time at bodyweight',
    unit: 's',
    group: 'finger',
    how: 'Two hands, 20 mm edge, half-crimp, nothing added. Hang until you cannot hold the position — not until you drop off in a worse one.',
    why: 'A way to test at all when you have no way to add or take off weight. Endurance and strength are mixed in here, so read it as a rough second opinion.',
  },
  {
    id: 'weighted_pullup',
    label: 'Weighted pull-up (1RM)',
    unit: 'kg',
    group: 'strength',
    how: 'From a dead hang to chin over the bar, one clean rep, no kipping. Work up in small jumps with full rest. Record the added weight, not your bodyweight.',
    why: 'General pulling strength. Climbing rarely needs a big number here, but a very low one limits steep terrain.',
  },
  {
    id: 'lock_off',
    label: 'Lock-off hold',
    unit: 's',
    group: 'strength',
    bilateral: true,
    how: 'One arm on the bar at 90°, the other off. Hold the position — the clock stops when the elbow angle opens. Per arm.',
    why: 'The strength that lets you stay still long enough to place a foot or read the next move.',
  },
  {
    id: 'front_lever',
    label: 'Front lever',
    unit: 's',
    group: 'strength',
    how: 'Hang from a bar and bring your body to horizontal — straight, feet at head height. Time the hold at the hardest position you can keep flat. Note in the notes field which progression you used (tuck, one leg, straddle, full), or the number means something different every time.',
    why: 'Tension through the middle: what stops your feet cutting on steep ground.',
  },
  {
    id: 'l_sit',
    label: 'L-sit',
    unit: 's',
    group: 'strength',
    how: 'Hanging from a bar, lift straight legs to horizontal and hold. The clock stops when the knees bend or the legs drop.',
    why: 'Front-body strength with straight legs, which is where most climbers are weakest.',
  },
  {
    id: 'toes_to_bar',
    label: 'Toes to bar',
    unit: 'reps',
    group: 'strength',
    how: 'Hang, bring both feet to touch the bar, lower under control. Count clean reps in a row — stop at the first swing or bent knee.',
    why: 'The same tension as the L-sit, but through a range, which is closer to how you actually use it.',
  },
  {
    id: 'pushups',
    label: 'Push-ups',
    unit: 'reps',
    group: 'strength',
    how: 'Chest to fist height, body straight, full lockout at the top. Count reps until form goes.',
    why: 'Pressing balance. Climbers are overwhelmingly pull-trained, and this is the cheapest check on how far that has gone.',
  },
  {
    id: 'sargent',
    label: 'Sargent jump',
    unit: 'cm',
    group: 'power',
    normalise: 'height',
    how: 'Stand side-on to a wall, reach up and mark the highest point you can touch flat-footed. Then jump from standing — no run-up, one dip — and mark again. Record the difference between the two marks, not the height reached.',
    why: 'Leg power, which is what modern competition setting asks for constantly and older training plans ignored.',
  },
  {
    id: 'standing_long_jump',
    label: 'Standing long jump',
    unit: 'cm',
    group: 'power',
    normalise: 'height',
    how: 'Both feet behind a line, jump forward, land on both feet without falling back. Measure to the heel closest to the line. Best of three.',
    why: 'The same power, pushed forward instead of up — closer to a dyno than the vertical jump is.',
  },
  {
    id: 'split_to_wall',
    label: 'Split to wall',
    unit: 'cm',
    group: 'mobility',
    normalise: 'height',
    how: 'Sit with legs in a straddle, feet against a wall, back straight. Measure between the heels. Warm up first — this is a range test, not a stretch to your limit.',
    why: 'Hip range for high steps and drop knees. Low numbers here show up as blocked positions on the wall long before they hurt.',
  },
  {
    id: 'hamstring',
    label: 'Hamstring reach',
    unit: 'cm',
    group: 'mobility',
    normalise: 'height',
    how: 'Sit with legs straight and feet against a box, reach forward with straight knees and hold. Measure from your fingertips to your toes — past them is a positive number, short of them negative.',
    why: 'Hamstring and lower-back range, which is what a high foot actually costs you.',
  },
  {
    id: 'shoulder_mobility',
    label: 'Shoulder mobility',
    unit: 'cm',
    group: 'mobility',
    bilateral: true,
    how: 'One hand over the shoulder and down your back, the other up from below. Measure the gap between the fingertips — overlapping is a negative number. Record per side by which hand is on top.',
    why: 'Overhead range. Restriction here is closely tied to the shoulder problems climbers pick up.',
  },
  {
    id: 'high_step',
    label: 'High step',
    unit: 'cm',
    group: 'mobility',
    normalise: 'height',
    bilateral: true,
    how: 'Stand facing a wall, hands on it, and place one foot as high as you can with the standing leg straight and the hips square. Measure the floor-to-foot height. Per leg.',
    why: 'The most climbing-specific of the mobility tests: this is a rock-over, measured.',
  },
  {
    id: 'single_leg_squat',
    label: 'Single-leg squat',
    unit: 'reps',
    group: 'mobility',
    bilateral: true,
    how: 'One leg, squat until the thigh is at least horizontal, stand back up without touching down. Count clean reps per leg.',
    why: 'Leg strength and knee control together. A gap between legs is the point of testing both.',
  },
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
  const userId = await currentUserId()
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

export async function deletePhysicalTest(id) {
  const { error } = await supabase.from('physical_tests').delete().eq('id', id)
  if (error) throw error
  notifyCoachChanged()
}

// The newest result per test (per side, where the test has two), which is what
// "where am I now" means for a battery you retest every few months.
export function latestPerTest(physicalTests = []) {
  const seen = new Map()
  for (const t of physicalTests) {
    const key = `${t.test_id}:${t.side || ''}`
    if (!seen.has(key)) seen.set(key, t)
  }
  return [...seen.values()]
}

// A sitting of tests, saved together: every result, plus a session in the diary
// so a testing day isn't a hole in your training log. Testing is training -
// a max-hang test is a maximal finger day whether or not you call it one, and
// the recovery window has to see it.
//
// The session is named F1 (Max hangs) when the sitting included a max-effort
// finger test, which is what it physically was - so fingerDose scores it as
// the hard day it is instead of an untagged hour.
export async function logTestSession({ tested_on, duration, results, notes }) {
  const rows = results.filter((r) => r.value !== '' || r.aborted_reason)
  for (const r of rows) {
    const meta = testMeta(r.test_id)
    await addPhysicalTest({
      tested_on,
      test_id: r.test_id,
      value: r.value === '' ? null : Number(r.value),
      unit: meta.unit || null,
      side: meta.bilateral ? r.side || null : null,
      aborted_reason: r.aborted_reason || null,
      notes: r.notes?.trim() || null,
    })
  }

  const ids = rows.map((r) => r.test_id)
  const groups = new Set(ids.map((id) => testMeta(id).group))
  // Maximal finger tests are the ones that load tissue like a hard session.
  const maximalFinger = ids.some((id) =>
    ['half_crimp', 'open_3', 'pinch', 'max_hang', 'hang_time'].includes(id),
  )
  return {
    count: rows.length,
    session: {
      date: tested_on,
      sport: groups.has('finger') ? 'finger' : 'strength',
      subtype: null,
      duration: duration === '' || duration == null ? null : Number(duration),
      notes: notes?.trim() || null,
      extra: {
        test_session: { ids },
        ...(maximalFinger ? { coach: { followed: 'other', type: null, exercises: ['F1'] } } : {}),
      },
      routes: [],
    },
  }
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
