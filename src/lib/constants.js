// Domain constants for the training diary. Kept in one place so the data model,
// the register flow, and (later) the stats views all agree on vocabulary.

export const SPORTS = {
  cycling: { key: 'cycling', label: 'Cycling', emoji: '🚴', color: 'var(--cycling)' },
  climbing: { key: 'climbing', label: 'Climbing', emoji: '🧗', color: 'var(--climbing)' },
}

export const SUBTYPES = {
  cycling: [
    { key: 'road', label: 'Road' },
    { key: 'gravel', label: 'Gravel' },
  ],
  climbing: [
    { key: 'bouldering', label: 'Bouldering' },
    { key: 'sport', label: 'Sport' },
    { key: 'trad', label: 'Trad' },
  ],
}

export const LOCATIONS = [
  { key: 'indoor', label: 'Indoor' },
  { key: 'outdoor', label: 'Outdoor' },
]

export const SEND_TYPES = [
  { key: 'onsight', label: 'Onsight', short: 'OS' },
  { key: 'flash', label: 'Flash', short: 'FL' },
  { key: 'redpoint', label: 'Redpoint', short: 'RP' },
  { key: 'attempt', label: 'Attempt', short: 'Att' },
]

// French (Fontainebleau) grades for bouldering.
export const BOULDER_GRADES = [
  '3', '4', '5', '5+',
  '6a', '6a+', '6b', '6b+', '6c', '6c+',
  '7a', '7a+', '7b', '7b+', '7c', '7c+',
  '8a', '8a+', '8b', '8b+', '8c', '8c+', '9a',
]

// French sport-climbing grades (used for sport + trad).
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

export const FEELING_LABELS = {
  1: 'Weak',
  2: 'Below',
  3: 'OK',
  4: 'Good',
  5: 'Strong',
}

export const RPE_HINT = {
  1: 'Very easy',
  3: 'Easy',
  5: 'Moderate',
  7: 'Hard',
  9: 'Very hard',
  10: 'Max',
}
