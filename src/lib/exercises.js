// The exercise library the coach prescribes from. Translated from the training
// plan the app's owner actually uses, so a suggestion is a real session with a
// name and a protocol - not "do some power-endurance".
//
// `fingerCost` is what the coach's recovery guards read: 'high' means the
// session maximally loads finger connective tissue and must respect the
// ~48-72 h rebuild window. `needs` gates an exercise on facilities the athlete
// actually has (no spray wall, no circuits).

// The pump scale used throughout. Pump is metabolic and clears in hours -
// deliberately a different axis from finger/pulley load, which takes days.
export const PUMP_SCALE = [
  { level: 1, label: 'No pump', quality: 'Endurance' },
  { level: 2, label: 'Slight pump', quality: 'Endurance' },
  { level: 3, label: 'Moderate pump', quality: 'Endurance' },
  { level: 4, label: 'Very pumped', quality: 'Endurance / power-endurance' },
  { level: 5, label: 'Completely pumped', quality: 'Strength / power-endurance' },
]

export function pumpLabel(level) {
  return PUMP_SCALE.find((p) => p.level === Number(level))?.label || null
}

// ---- finger training --------------------------------------------------------
export const FINGER_EXERCISES = [
  {
    id: 'F1', youthRestricted: true, loads: ['fingers'], name: 'Max deadhang', category: 'finger', fingerCost: 'high',
    needs: ['hangboard'], minutes: 30,
    time: '10 s', reps: '1', sets: '4', rest: '6 min',
    load: '80–90% of 1RM', edge: '20 mm',
    how: 'Hang for 10 seconds at 80–90% of your one-rep max. Full rest between sets — this is a strength session, and a rushed one is just fatigue.',
  },
  {
    id: 'F2', loads: ['fingers'], name: 'Endurance deadhang', category: 'finger', fingerCost: 'high',
    needs: ['hangboard'], minutes: 30,
    time: '7 s on / 3 s off', reps: '6–10', sets: '5', rest: '3 min',
    load: 'Bodyweight or light added', edge: '20 mm',
    how: 'Repeaters: 7 seconds on, 3 seconds off, 6–10 reps per set. Stop the set if your form breaks rather than grinding out the last rep.',
  },
  {
    id: 'F3', name: 'Campus', category: 'finger', fingerCost: 'high',
    needs: ['campus'], minutes: 30, youthRestricted: true,
    loads: ['fingers', 'elbow', 'shoulder'],
    reps: '2 ladders', sets: '10', rest: '3–4 min', load: 'Bodyweight',
    edge: 'Medium to large rungs',
    how: 'Two ladders per set — 1-3-5 up and matched down, or bumps if that is your weakness. Explosive, on medium-to-large rungs. Long rests: this is a power session, and once the reps slow down it has become a pump session and should stop.',
  },
  {
    // The missing piece the rest of the model kept needing: a finger session
    // that is genuinely low-cost. It is the answer to a cold start, to a
    // deload, and to "your fingers aren't ready but you want to touch a
    // hangboard" - and it is the safest thing in the library.
    id: 'F4', name: 'Sub-max no-hangs', category: 'finger', fingerCost: 'low',
    needs: ['hangboard'], minutes: 10, loads: ['fingers'],
    time: '10 s on / 50 s off', reps: '6', sets: '1–2',
    rest: '≥6 h between sets', load: '~70–80% of a hard pull — never near failure',
    edge: '20 mm or larger',
    how: 'Feet on the floor, pulling up into an edge rather than hanging from it, at around 70–80% of what you could pull. Ten seconds on, fifty off, six reps — about ten minutes. Can be done most days, and twice a day if the two are at least six hours apart. It should never feel hard.',
    note: 'Low-intensity, high-frequency finger loading. Emil Abrahamsson popularised this format; the underlying rationale (short, frequent, sub-maximal bouts) is extrapolated from in-vitro collagen work rather than shown in human tendon.',
  },
]

// ---- rope ------------------------------------------------------------------
export const ROPE_EXERCISES = [
  {
    id: 'K1', loads: ['fingers'], gradeContext: 'outdoor', name: 'Projecting / attempts', category: 'rope', fingerCost: 'high', style: 'outdoor',
    pump: [1, 2], minutes: 120, needs: ['rope'],
    how: 'Project 2–4 routes with plenty of rest — at least 15 minutes between attempts. The rest is the point: you are training hard moves, not endurance.',
  },
  {
    id: 'K2', gradeContext: 'indoor', name: '10 min on, 10 min off', category: 'rope', fingerCost: 'low',
    pump: [1, 2], minutes: 80, needs: ['rope'],
    how: 'Stay on the wall for 10 minutes without coming near the ground — climb up and down until the time is up. Then 10 minutes rest. Repeat 3–4 times. On autobelay or toprope. You should not get badly pumped.',
  },
  {
    id: 'K3', gradeContext: 'indoor', name: 'Hard–Easy', category: 'rope', fingerCost: 'medium',
    pump: [3, 3], minutes: 90, needs: ['rope'],
    how: 'Find a hard and an easy route on the same line, or lines close together. Climb the hard route, then go straight onto the easy one with no rest. The easy route is where you try to climb the pump out. Repeat 5 times.',
  },
  {
    id: 'K4', gradeContext: 'indoor', name: 'Hard–Hard', category: 'rope', fingerCost: 'medium',
    pump: [3, 4], minutes: 90, needs: ['rope'],
    how: 'Same idea as Hard–Easy, but both routes are hard. Little rest between sets, 5 sets.',
  },
  {
    id: 'K5', gradeContext: 'indoor', name: 'Up–Down–Up', category: 'rope', fingerCost: 'medium',
    pump: [3, 4], minutes: 90, needs: ['rope'],
    how: 'Pick a medium-hard route. Climb it up, down, and up again with no rest in between. Repeat 5 times.',
  },
  {
    id: 'K6', gradeContext: 'indoor', name: '3 in a row', category: 'rope', fingerCost: 'medium',
    pump: [3, 3], minutes: 90, needs: ['rope'],
    how: 'Pick a medium-hard route and climb it three times back to back with no rest. Repeat 5 times.',
  },
  {
    id: 'K7', gradeContext: 'indoor', name: 'Normal lead climbing', category: 'rope', fingerCost: 'medium', style: 'comp',
    pump: [2, 3], minutes: 120, needs: ['rope'],
    how: 'Climb 6–10 routes including warm-ups. Reasonable rests, but no need for more than 10–15 minutes.',
  },
  {
    id: 'C3', gradeContext: 'indoor', name: 'Competition simulation — lead',
    category: 'rope', fingerCost: 'medium', style: 'comp',
    pump: [4, 5], minutes: 90, needs: ['rope'],
    time: '6 min', sets: '1–2 routes', rest: 'Full rest between',
    how: 'One route you have not seen and have not watched anyone on. Six minutes of observation from the ground, then one attempt under onsight rules — a fall ends it. Climb it as if it counts, because the thing you are training is reading and pacing under pressure, not fitness.',
  },
]

// ---- bouldering -------------------------------------------------------------
export const BOULDER_EXERCISES = [
  {
    id: 'B1', loads: ['fingers'], gradeContext: 'board', name: 'Circuit — short', category: 'boulder', fingerCost: 'medium',
    pump: [4, 5], minutes: 90, needs: ['spraywall'],
    how: 'Set a circuit of 25–30 moves on a training wall and climb it 4–6 times. Rest about 10 minutes, or until you feel recovered.',
  },
  {
    id: 'B2', loads: ['fingers'], gradeContext: 'board', name: 'Circuit — long', category: 'boulder', fingerCost: 'medium',
    pump: [3, 4], minutes: 90, needs: ['spraywall'],
    how: 'Set a circuit of 40–50 moves and climb it 4–6 times. Rest about 10 minutes — you do not need to be fully recovered.',
  },
  {
    id: 'B3', gradeContext: 'indoor', name: '4×4', category: 'boulder', fingerCost: 'medium',
    pump: [4, 5], minutes: 75,
    how: 'Pick four hard boulders. Climb each one 4 times in a row with 1 minute per attempt — if the climb takes 30 seconds you get 30 seconds rest. After the fourth go, rest 7–10 minutes.',
  },
  {
    id: 'B4', gradeContext: 'indoor', name: '10×3', category: 'boulder', fingerCost: 'medium',
    pump: [4, 5], minutes: 90,
    how: 'Pick 10 medium-to-hard boulders. Climb each 3 times in a row with no rest; climbing time equals rest time, so keep a watch. Adjust the grade to your form — all 3 goes should ideally go, and at least 2 must.',
  },
  {
    id: 'B5', loads: ['fingers'], gradeContext: 'board', name: 'Max bouldering on the training wall', category: 'boulder', fingerCost: 'high', style: 'outdoor',
    pump: [1, 2], minutes: 60, needs: ['spraywall'],
    how: 'On the training board. Start on a boulder and give it a few goes — at most 4 attempts in 15 minutes — then move on. You should send it or be close after a few tries. These should be finger-heavy.',
  },
  {
    id: 'B6', gradeContext: 'indoor', name: 'Easy bouldering', category: 'boulder', fingerCost: 'low',
    pump: [1, 2], minutes: 60,
    how: 'Five boulders, three times each, a few grades below your max. Two minutes rest between goes, five minutes between boulders. Focus on what you can improve on each attempt.',
  },
  {
    id: 'B7', gradeContext: 'indoor', name: 'Technique bouldering', category: 'boulder', fingerCost: 'low', style: 'comp',
    pump: [1, 2], minutes: 60,
    how: 'A relatively easy session on set boulders or ones you make up to challenge your technique. Good holds — you should not get tired, but it should still be hard. Slab and coordination boulders.',
  },
  {
    id: 'B8', loads: ['fingers'], gradeContext: 'indoor', name: 'Boulder projecting', category: 'boulder', fingerCost: 'high', style: 'outdoor',
    pump: [1, 2], minutes: 60,
    how: 'Project 3–5 boulders at your max level with good rest between attempts. Training board or set boulders.',
  },
  {
    id: 'B9', gradeContext: 'indoor', name: 'Normal bouldering', category: 'boulder', fingerCost: 'medium',
    pump: [2, 3], minutes: 90,
    how: 'Free bouldering on set boulders.',
  },
  {
    id: 'B10', youthRestricted: true, loads: ['fingers','elbow','shoulder'], gradeContext: 'board', name: 'Campus bouldering', category: 'boulder', fingerCost: 'high', style: 'outdoor',
    pump: [1, 2], minutes: 25, needs: ['spraywall'],
    how: 'Make up campus boulders on the training wall, 6–15 moves each. Experiment, and try at least 2 different ones.',
  },
  {
    id: 'B11', gradeContext: 'indoor', name: 'Climb 50 boulders', category: 'boulder', fingerCost: 'medium',
    pump: [2, 3], minutes: 90,
    how: 'Bring paper and a pencil and climb at least 50 boulders — warm-ups count. Cover every style: crimps, jugs, slopers.',
  },
  {
    id: 'C1', loads: ['fingers'], gradeContext: 'indoor', name: 'Competition simulation — boulder',
    category: 'boulder', fingerCost: 'high', style: 'comp',
    pump: [3, 4], minutes: 90,
    sets: '4–5 boulders', time: '4–5 min on', rest: '4–5 min between',
    how: 'Have someone pick 4–5 boulders you have not seen or watched. 4–5 minutes on each, then the same rest, in order. No beta from anyone, and no second visit — when the clock goes you move on whether or not you topped it. This trains the part of competing that nothing else does: reading a boulder cold and committing first go.',
  },
  {
    id: 'C2', gradeContext: 'indoor', name: 'Flash session', category: 'boulder',
    fingerCost: 'medium', style: 'comp',
    pump: [2, 3], minutes: 75,
    how: 'Pick 8–12 boulders you have never tried, around your flash grade. One attempt each — send it or not, you move on. Read every one from the ground before you touch it. The skill being trained is choosing the right beta first time, not trying hard.',
  },
  {
    id: 'W1', gradeContext: 'board', name: 'Set your own boulders', category: 'boulder', fingerCost: 'low',
    pump: [1, 2], minutes: 90, needs: ['spraywall'],
    how: 'Set at least 5 good warm-up boulders — at least one per wall, ideally two or three. Use these on your bouldering sessions from now on: over time they become your daily-form gauge, because you learn how they should feel. If you have energy left, set a few projects too. Those should feel hard, right on the edge of impossible.',
  },
]

// ---- strength ---------------------------------------------------------------
export const GYM_EXERCISES = [
  { id: 'S1', loads: ['shoulder','elbow'], name: 'Weighted pull-ups', reps: '3–5', sets: '3–5', load: '80–90% of 1RM', rest: '3–6 min' },
  { id: 'S2', loads: ['shoulder','elbow'], name: 'Lock-off', reps: '5–10 s', sets: '3–4', load: '−10 kg assist', rest: '3–6 min' },
  { id: 'S3', youthRestricted: true, loads: ['shoulder','elbow'], name: 'One-arm pull on rings', reps: '4–8', sets: '3–5', rest: '3–6 min' },
  { id: 'S4', loads: ['shoulder','elbow'], name: 'Row', reps: '3–5', sets: '3–5', load: 'Test yourself', rest: '3–6 min' },
  { id: 'S5', loads: ['shoulder'], name: 'Kettlebell shoulder press', reps: '5–8', sets: '3–4', load: 'Test yourself', rest: '3–6 min', how: 'Bottoms-up — the heavy end pointing upward.' },
  { id: 'S6', loads: ['shoulder'], name: 'Flies in slings', reps: '5–8', sets: '3–5', rest: '3–6 min' },
  { id: 'S7', name: 'Squats', reps: '3–5', sets: '3–5', load: 'Test yourself', rest: '3–6 min' },
  { id: 'S8', name: 'Deadlift', reps: '3–5', sets: '3–5', load: 'Test yourself', rest: '2–5 min' },
  { id: 'S8b', loads: ['back'], name: 'Toes to bar', reps: '6–12', sets: '3–5', rest: '3–6 min' },
  { id: 'S9', loads: ['back'], name: 'Toes to sky', reps: '4–8', sets: '3–5', rest: '3–6 min' },
  { id: 'S10', loads: ['back','shoulder'], name: 'Superman in slings', reps: '4–8', sets: '3–5', rest: '2–4 min' },
  { id: 'S11', loads: ['back'], name: 'Worm in slings', reps: '8–12', sets: '3–5', rest: '2–4 min' },
  {
    id: 'S12', name: 'Shoulder external rotations', reps: '5–10', sets: '3–5',
    load: 'Light — this is prehab, not a lift', rest: '2–3 min',
    rehabFor: ['shoulder'],
    how: 'Climbing is overwhelmingly pull-dominant, and low external-rotation strength relative to internal is one of the more consistent shoulder-injury associations. Worth keeping in year-round.',
  },
  {
    // Added because the library had shoulder prehab but nothing for the elbow,
    // and medial/lateral elbow pain is one of the most common things that
    // quietly ends a climber's season.
    id: 'S15', name: 'Wrist extensor & flexor eccentrics', reps: '10–15', sets: '3',
    load: 'Light dumbbell or a rubber bar', rest: '2 min',
    rehabFor: ['elbow', 'wrist'],
    how: 'Forearm supported, lower the weight slowly (3–4 s) and help it back up with the other hand. Extensors for lateral elbow pain, flexors for medial "climber\'s elbow". Slow and light — the eccentric is the point, load is not.',
  },
  {
    id: 'S13', name: 'Circuit', reps: '10–20', sets: '5', rest: 'Max 2 min',
    how: 'Pull-ups, sit-ups, jumping squats, push-ups. Do the reps as well as you can with as little rest as possible — this is closer to an endurance session than pure strength.',
  },
  {
    id: 'S14', name: 'Pyramid', sets: '1 pyramid', rest: 'Minimal',
    how: 'Pull-ups, sit-ups, jumping squats, push-ups. Set 1 is one rep of each, set 2 is two of each, up to ten, then back down — 100 reps of each in total. Try to finish in the shortest time you can.',
  },
].map((e) => ({ ...e, category: 'strength', fingerCost: e.id === 'S1' || e.id === 'S2' || e.id === 'S3' ? 'low' : 'none', needs: ['gym'], minutes: 60 }))

// ---- mobility ---------------------------------------------------------------
export const STRETCH_EXERCISES = [
  { id: 'T1', name: 'Butterfly', how: 'Sit on the floor with the soles of your feet together and knees out to the sides, and work the knees toward the floor.' },
  { id: 'T2', name: 'Frog', how: 'Knees and elbows on the floor, stretching the inner thigh.' },
  { id: 'T3', name: 'Splits', how: 'Sit in the splits and move slowly from side to side with your upper body.' },
  { id: 'T4', name: 'Hamstring', how: 'Sitting or standing, stretch the hamstring.' },
  { id: 'T5', name: 'Back', how: 'On your back, lift one straight leg up and across to the opposite side, ideally keeping both shoulders down. Then lie on your front and do the same.' },
].map((e) => ({ ...e, category: 'stretch', fingerCost: 'none', needs: [], minutes: 20, hold: '2 min', sets: '2', rest: '2 min' }))

export const ALL_EXERCISES = [
  ...FINGER_EXERCISES,
  ...ROPE_EXERCISES,
  ...BOULDER_EXERCISES,
  ...GYM_EXERCISES,
  ...STRETCH_EXERCISES,
]

export const EXERCISE_MAP = Object.fromEntries(ALL_EXERCISES.map((e) => [e.id, e]))

export const STRETCH_PROTOCOL =
  'Hold each for 2 minutes with at least 2 minutes rest, twice through.'

// The session menu: what to do at each intensity tier, per session category.
// Numbers in the pump column are levels on the scale above.
export const MATRIX_COLUMNS = [
  { key: 'pump', label: 'Pump' },
  { key: 'ropeVolume', label: 'Rope volume' },
  { key: 'ropeHard', label: 'Hard moves — rope' },
  { key: 'boulderHard', label: 'Hard moves — bouldering' },
  { key: 'boulderLow', label: 'Low-intensity bouldering' },
  { key: 'boulderVolume', label: 'Bouldering volume' },
]

export const MATRIX_ROWS = [
  {
    level: 1, label: 'Easy',
    cells: {
      pump: { text: 'Hard–Easy', ex: 'K3', pump: [4, 5] },
      ropeVolume: { text: 'Pyramid', pump: [2, 3] },
      ropeHard: { text: 'Attempts on rope. 2–3 goes at or above your max. If you fall you may try once more. Good rest between goes.', ex: 'K1' },
      boulderHard: { text: 'Hard commercial boulders — work the moves and look for projects. 4–8 boulders.' },
      boulderLow: { text: 'Lots of easy boulders.', ex: 'B6' },
      boulderVolume: { text: '4×4', ex: 'B3' },
    },
  },
  {
    level: 2, label: 'Easy+',
    cells: {
      pump: { text: 'Hard–Hard', ex: 'K4', pump: [5, 5] },
      ropeVolume: { text: '2 in a row', ex: 'K6', pump: [2, 3] },
      ropeHard: { text: 'Projecting on rope. Find 2–3 routes, climb as high as you get, then work it to the top. Go again and work the crux. Good rest between routes.', ex: 'K1' },
      boulderHard: { text: 'Training board — 3 attempts before moving on. 6–8 boulders.', ex: 'B5' },
      boulderLow: { text: 'Drilling moves.' },
      boulderVolume: { text: '10×3', ex: 'B4' },
    },
  },
  {
    level: 3, label: 'Medium',
    cells: {
      pump: { text: 'Circuit on the spray wall', ex: 'B1', pump: [3, 5] },
      ropeVolume: { text: '20 min × 2', ex: 'K2', pump: [1, 2] },
      ropeHard: { text: 'Training board. Find boulders with many moves, ideally 10+. Work one or two, or find several you can send.', ex: 'B5' },
      boulderHard: { text: 'Commercial boulders, working on flashing. Move on if you don’t flash it, and come back to test later.' },
      boulderLow: { text: 'Visualisation and drilling. In a new gym: climb at least 20 boulders (some more than once) up to around red, ideally on technically demanding ones. Repeat technical moves 3 times in a row if you don’t flash them easily. Slab counts, as long as it isn’t easier than yellow.' },
      boulderVolume: { text: '20×1' },
    },
  },
  {
    level: 4, label: 'Medium+',
    cells: {
      pump: { text: 'Up–Down–Up', ex: 'K5', pump: [3, 4] },
      ropeVolume: { text: '10 min × 3', ex: 'K2', pump: [2, 3] },
      ropeHard: { text: 'Drilling moves and movement on rope.' },
      boulderHard: { text: 'Work hard boulders on the training board, with good rest between attempts.', ex: 'B5' },
      boulderLow: { text: 'Slab.', ex: 'B7' },
      boulderVolume: { text: 'Work through the colours.' },
    },
  },
  {
    level: 5, label: 'Hard',
    cells: {
      pump: { text: '4 min on, 4 min off on the spray wall', ex: 'B1', pump: [4, 5] },
      ropeVolume: { text: '10 routes in one session, little rest between them.', ex: 'K7' },
      ropeHard: { text: 'Onsight near your max. Find 4–6 routes and try to onsight them. If you fall, you’re down.' },
      boulderHard: { text: 'Drill competition-style moves. Find commercial ones, set your own, or reuse moves from training. Decide up front how long you’ll give it — 20 minutes, say.' },
      boulderLow: { text: 'Footwork.', ex: 'B7' },
      boulderVolume: { text: 'Drilling moves.' },
    },
  },
]

// Exercises the athlete can actually do, given their facilities. `rope` is
// gated on discipline focus rather than equipment.
//
// With no profile saved we filter nothing: not having been asked yet is not
// the same as having answered "no", and silently hiding every hangboard
// session from someone who simply hasn't filled the form in is worse than
// showing one they can't do.
export function availableExercises(list, profile, discipline) {
  if (!profile) return list
  // A rope goal makes rope sessions relevant even for someone whose standing
  // focus is bouldering - what you're training for right now wins.
  const forRope = (discipline || profile?.focus) !== 'boulder'
  const has = {
    hangboard: !!profile?.has_hangboard,
    campus: !!profile?.has_campus,
    spraywall: !!profile?.has_spraywall,
    gym: !!profile?.has_gym,
    rope: forRope,
  }
  return list.filter((e) => (e.needs || []).every((n) => has[n] !== false))
}
