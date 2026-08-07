// Domain constants for the training diary. Kept in one place so the data model,
// the register flow, and the stats views all agree on vocabulary.

export const SPORTS = {
  cycling: { key: 'cycling', label: 'Cycling', emoji: '🚴', color: 'var(--cycling)' },
  running: { key: 'running', label: 'Running', emoji: '🏃', color: 'var(--running)' },
  swimming: { key: 'swimming', label: 'Swimming', emoji: '🏊', color: 'var(--swimming)' },
  climbing: { key: 'climbing', label: 'Climbing', emoji: '🧗', color: 'var(--climbing)' },
  strength: { key: 'strength', label: 'Strength', emoji: '💪', color: 'var(--strength)' },
  finger: { key: 'finger', label: 'Finger', emoji: '🤏', color: 'var(--finger)' },
}

// Zone colours, cool → hot. Shared by the analysis bars and the Profile zone
// editor so Z3 is always the same green everywhere.
export const ZONE_COLORS = ['#94a3b8', '#38bdf8', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#ec4899']

// Strength exercises offered in the picker (each logs sets · reps · weight).
export const STRENGTH_EXERCISES = [
  { key: 'pullups', label: 'Pull-ups' },
  { key: 'pushups', label: 'Push-ups' },
  { key: 'flies', label: 'Flies' },
  { key: 'superman', label: 'Superman' },
  { key: 'squats', label: 'Squats' },
  { key: 'deadlift', label: 'Deadlift' },
  { key: 'shoulderpress', label: 'Shoulder press' },
]

export function exerciseLabel(key) {
  return STRENGTH_EXERCISES.find((e) => e.key === key)?.label || key
}

export const SUBTYPES = {
  cycling: [
    { key: 'road', label: 'Road' },
    { key: 'gravel', label: 'Gravel' },
    // A motor doing part of the work is a bigger difference than road vs
    // gravel, so it is a type of its own rather than a flag on one of them.
    { key: 'ebike', label: 'E-bike ⚡' },
  ],
  running: [
    { key: 'road', label: 'Road' },
    { key: 'trail', label: 'Trail' },
    { key: 'treadmill', label: 'Treadmill' },
  ],
  swimming: [
    { key: 'pool', label: 'Pool' },
    { key: 'openwater', label: 'Open water' },
  ],
  climbing: [
    { key: 'bouldering', label: 'Bouldering' },
    { key: 'sport', label: 'Sport' },
    { key: 'trad', label: 'Trad' },
  ],
}

export const EBIKE = 'ebike'

// A ride with a motor. Still cycling, and it still counts as training time, but
// the distance and speed came partly from the battery, so anything that ranks
// rides against each other has to be able to tell them apart.
export function isEbike(session) {
  return session?.sport === 'cycling' && session?.subtype === EBIKE
}

// Session lists print the subtype key as-is ("road", "gravel"). "ebike" is the
// one that doesn't read as a word, and it carries the bolt everywhere it shows.
export function subtypeWord(subtype) {
  return subtype === EBIKE ? 'e-bike ⚡' : subtype
}

export const LOCATIONS = [
  { key: 'indoor', label: 'Indoor' },
  { key: 'outdoor', label: 'Outdoor' },
]

export const SEND_TYPES = [
  { key: 'onsight', label: 'Onsight', short: 'OS' },
  { key: 'flash', label: 'Flash', short: 'FL' },
  { key: 'redpoint', label: 'Redpoint', short: 'RP' },
  // A 2nd-go send is a finer-grained redpoint: picking it also marks Redpoint
  // as active (see RoutesEditor's isSendActive).
  { key: 'secondgo', label: '2. go', short: '2g' },
  { key: 'attempt', label: 'Attempt', short: 'Att' },
]

// Fontainebleau boulder grades are written with an uppercase letter (8B+).
export const BOULDER_GRADES = [
  '3', '4', '5', '5+',
  '6A', '6A+', '6B', '6B+', '6C', '6C+',
  '7A', '7A+', '7B', '7B+', '7C', '7C+',
  '8A', '8A+', '8B', '8B+', '8C', '8C+', '9A',
]

// French sport-climbing grades (used for sport + trad) use a lowercase letter.
export const ROUTE_GRADES = [
  '4a', '4b', '4c',
  '5a', '5b', '5c',
  '6a', '6a+', '6b', '6b+', '6c', '6c+',
  '7a', '7a+', '7b', '7b+', '7c', '7c+',
  '8a', '8a+', '8b', '8b+', '8c', '8c+',
  '9a', '9a+', '9b', '9b+', '9c',
]

export function gradesFor(subtype) {
  return subtype === 'bouldering' ? BOULDER_GRADES : ROUTE_GRADES
}

// Boulder grades show an uppercase letter (8B+), route grades a lowercase one
// (8b+). Normalize a stored grade to the right case for its subtype, so values
// saved before this convention (all lowercase) still display and match cleanly.
export function formatGrade(grade, subtype) {
  if (!grade) return grade
  const g = String(grade)
  return subtype === 'bouldering' ? g.toUpperCase() : g.toLowerCase()
}

export const FEELING_LABELS = {
  1: 'Weak',
  2: 'Below',
  3: 'OK',
  4: 'Good',
  5: 'Strong',
}
