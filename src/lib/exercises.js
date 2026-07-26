// The exercise library the coach prescribes from (spec v4).
//
// Two axes, deliberately separate:
//   `category`   what the session physically is - finger / boulder / rope /
//                strength / mobility / mental / warmup. Drives the library
//                tabs, facility gating and discipline preference.
//   `sessionCat` where it sits in the session grid (hardBoulder, pump,
//                fingerStrength, ...). Paired with `tier` (1-5) this is what a
//                prescription actually is.
//
// v3 collapsed those onto one 12-value SESSION_TYPES enum, which meant "tired
// fingers" had to become a *different session* rather than the same session one
// tier down. The grid is strictly more expressive and it is what the decision
// tree wants (see coach.js §hard/soft rules).
//
// Ids (F1, K3, B10, S12) are stable, language-neutral identifiers and are never
// renumbered - a logged session references one. `name` is English; `name_no`
// is an optional alias so a Norwegian-coached plan can be imported.
//
// `fingerCost` is what the recovery guards read: 'high' means the session
// maximally loads finger connective tissue and must respect the ~48-72 h
// rebuild window. `needs` gates on facilities the athlete actually has.
//
// `expectedDose` is what the session is *expected* to cost in the same
// arbitrary units fingerDose() computes after the fact. It lets the plan
// respect its own ceilings at prescription time instead of generating a week
// its guards then trim.

// ---------------------------------------------------------------------------
// grid axes
// ---------------------------------------------------------------------------

// Intensity tiers. The session bank this library is modelled on is a 5-row
// grid; "one tier down" is the single most useful adjustment a coach makes.
export const TIERS = [
  { tier: 1, label: 'Easy' },
  { tier: 2, label: 'Easy+' },
  { tier: 3, label: 'Medium' },
  { tier: 4, label: 'Medium+' },
  { tier: 5, label: 'Hard' },
]

export const SESSION_CATEGORIES = [
  { key: 'hardBoulder', label: 'Hard moves — bouldering', discipline: 'boulder' },
  { key: 'hardRope', label: 'Hard moves — rope', discipline: 'rope' },
  { key: 'pump', label: 'Pump / power-endurance', discipline: 'both' },
  { key: 'volumeBoulder', label: 'Bouldering volume', discipline: 'boulder' },
  { key: 'volumeRope', label: 'Rope volume', discipline: 'rope' },
  { key: 'lowIntBoulder', label: 'Low-intensity bouldering', discipline: 'boulder' },
  { key: 'fingerStrength', label: 'Finger strength', discipline: 'both' },
  { key: 'strength', label: 'Strength & prehab', discipline: 'both' },
  { key: 'mobility', label: 'Mobility & rehab', discipline: 'both' },
  { key: 'mental', label: 'Mental', discipline: 'both' },
  { key: 'warmup', label: 'Warm-up', discipline: 'both' },
]

export function tierLabel(tier) {
  return TIERS.find((t) => t.tier === tier)?.label || String(tier)
}

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

// ---------------------------------------------------------------------------
// warm-up protocols
// ---------------------------------------------------------------------------
// Note on ids: the spec proposed W1/W2/W3 for warm-ups, but W1 is already
// "Set your own boulders" and is referenced by logged sessions and by the
// technique session list. Ids are stable identifiers, so the warm-ups take
// WU1-WU3 instead. Renumbering an existing code to free it would silently
// re-point every session that logged W1.
export const WARMUP_PROTOCOLS = {
  general: {
    id: 'WU1',
    name: 'General warm-up',
    name_no: 'Generell oppvarming',
    how: '5–10 minutes of easy movement — pulse up, shoulders and hips through their range, no loading anything hard.',
  },
  finger_full: {
    id: 'WU2',
    name: 'Full finger warm-up',
    name_no: 'Fingeroppvarming',
    how: '5 min general movement, 10 easy pulls on jugs, then 5 × 10 s hangs ascending 40% → 50% → 60% → 70% → 75% of your max total load, 60–90 s between. Mandatory before any maximal finger loading.',
  },
  shoulder: {
    id: 'WU3',
    name: 'Shoulder & elbow warm-up',
    name_no: 'Skulder- og albueoppvarming',
    how: 'Band external rotations, scapular pull-ups and easy presses — 2 sets each, light. Before any hard pulling.',
  },
}

// Defaults applied to every entry so the engine can rely on the fields being
// present rather than testing for undefined at each use.
const DEFAULTS = {
  name_no: null,
  discipline: 'both',
  tier: 3,
  intensity: { anchor: 'none' },
  volume: null,
  durationTarget_min: 60,
  rpeTarget: null,
  pump: null,
  expectedDose: 0,
  gradeContext: null,
  gradeOffset: null,
  needs: [],
  loads: [],
  rehabFor: [],
  contraindicated: [],
  minYearsClimbing: 0,
  youth: 'allowed',
  warmup: 'general',
  progression: null,
  regression: null,
  termination: null,
  style: null,
}

const build = (list, fixed = {}) =>
  list.map((e) => ({
    ...DEFAULTS,
    ...fixed,
    ...e,
    // `minutes` is the display field the exercise card already renders.
    minutes: e.durationTarget_min ?? fixed.durationTarget_min ?? DEFAULTS.durationTarget_min,
  }))

// ---------------------------------------------------------------------------
// finger training
// ---------------------------------------------------------------------------
// All finger intensity is a percentage of TOTAL load (bodyweight included),
// never of added weight. A percentage of added weight is close to 100% of
// actual tissue load, because bodyweight is the dominant term - see
// fingerLoad.js for the arithmetic and the assisted-hang case.

export const FINGER_EXERCISES = build(
  [
    {
      id: 'F1',
      name: 'Max hangs',
      name_no: 'Maks dødheng',
      sessionCat: 'fingerStrength',
      tier: 5,
      intensity: { anchor: 'pctMaxTotal', lo: 0.8, hi: 0.9, edge_mm: 20, grip: 'halfcrimp' },
      volume: { work_s: 10, reps: 1, sets: 4, rest_s: 360 },
      durationTarget_min: 35,
      rpeTarget: { body: 5, finger: 9 },
      expectedDose: 40,
      fingerCost: 'high',
      needs: ['hangboard'],
      loads: ['fingers'],
      contraindicated: ['fingers'],
      minYearsClimbing: 2,
      youth: 'allowed_reduced',
      warmup: 'finger_full',
      time: '10 s',
      reps: '1',
      sets: '4',
      rest: '6 min',
      load: '80–90% of max total load',
      edge: '20 mm',
      how: 'Hang 10 seconds at 80–90% of your max total load, half-crimp. Full rest between sets — a rushed strength session is just fatigue.',
      margin:
        'Every hang must end with 2–3 seconds still in reserve. A set taken to failure means the load was too high — drop 5% for the rest of the session.',
      progression:
        'When all 4 sets hit target with the margin intact on two sessions running, add 2–3% of max total load. Retest every 8 weeks.',
      regression: 'F1 at 70–75% for 3 sets, then F4.',
      termination:
        'Stop if any set falls more than 2 s short of target, or at any finger pain at all. Do not finish the sets.',
    },
    {
      id: 'F2',
      name: 'Repeaters',
      name_no: 'Utholdende dødheng',
      sessionCat: 'fingerStrength',
      tier: 4,
      intensity: { anchor: 'pctMaxTotal', lo: 0.55, hi: 0.65, edge_mm: 20, grip: 'halfcrimp' },
      volume: { work_s: 7, off_s: 3, reps: 7, sets: 5, rest_s: 180 },
      durationTarget_min: 40,
      rpeTarget: { body: 5, finger: 7 },
      expectedDose: 32,
      fingerCost: 'high',
      needs: ['hangboard'],
      loads: ['fingers'],
      contraindicated: ['fingers'],
      minYearsClimbing: 2,
      youth: 'allowed_reduced',
      warmup: 'finger_full',
      time: '7 s on / 3 s off',
      reps: '7 (6–10)',
      sets: '5',
      rest: '3 min between sets',
      load: '55–65% of max total load',
      edge: '20 mm',
      how: 'Repeaters: 7 seconds on, 3 off. Pick a load you could hold continuously for about 30 seconds — roughly 80% of what you would use for a single 7 s effort. The last rep of the last set should be hard, not failed.',
      progression:
        'Add a rep per set (6 → 10) before adding load. Then add 2–3% and reset to 6 reps.',
      regression: 'Drop to 5 reps per set, then F4.',
      termination:
        'Stop the set at the first rep you cannot hold for the full 7 s; stop the session after two such sets.',
    },
    {
      id: 'F3',
      name: 'Campus',
      name_no: 'Campus',
      sessionCat: 'fingerStrength',
      tier: 5,
      intensity: { anchor: 'rpe', lo: 9, hi: 10 },
      volume: { reps: 2, sets: 6, rest_s: 210 },
      durationTarget_min: 25,
      rpeTarget: { body: 8, finger: 9 },
      expectedDose: 45,
      fingerCost: 'high',
      needs: ['campus'],
      loads: ['fingers', 'elbow', 'shoulder'],
      contraindicated: ['fingers', 'elbow', 'shoulder'],
      minYearsClimbing: 4,
      // The Norwegian federation still advises against campus training for
      // growing athletes even while no longer opposing controlled hangboarding.
      youth: 'blocked',
      warmup: 'finger_full',
      reps: '2 ladders',
      sets: '5–6',
      rest: '3–4 min',
      load: 'Bodyweight, feet off',
      edge: 'Medium to large rungs',
      how: 'A rep is one ladder — 1-3-5 matched, 1-4-7 bumped, or max reach, up only, controlled down or drop to the mat. Two ladders per set, medium-to-large rungs, long rests. Specify which ladder before you start; "2 reps" is not a session.',
      progression: 'Progress the ladder (1-3-5 → 1-4-7 → max reach), never the set count.',
      regression: 'B10 campus bouldering, then B12 coordination.',
      termination:
        'Stop at the first rep where the catch is uncontrolled. Loss of control is the injury mechanism, not fatigue.',
      note: 'Set count is deliberately 5–6, not 10: feet-off campus at ten sets is well beyond any published protocol. Requires a recorded max and ≥4 years climbing.',
    },
    {
      id: 'F4',
      name: 'Sub-max no-hangs',
      name_no: 'Sub-maks no-hangs',
      sessionCat: 'fingerStrength',
      tier: 1,
      intensity: { anchor: 'rpe', lo: 4, hi: 5 },
      volume: { work_s: 10, off_s: 50, reps: 6, sets: 1, rest_s: 21600 },
      durationTarget_min: 10,
      rpeTarget: { body: 2, finger: 4 },
      expectedDose: 8,
      fingerCost: 'low',
      needs: ['hangboard'],
      loads: ['fingers'],
      minYearsClimbing: 0,
      youth: 'allowed',
      warmup: 'general',
      time: '10 s on / 50 s off',
      reps: '6',
      sets: '1–2',
      rest: '≥6 h between sets',
      load: '~70–80% of a hard pull — never near failure',
      edge: '20 mm or larger',
      how: 'Feet on the floor, pulling up into an edge rather than hanging from it, at around 70–80% of what you could pull. Ten seconds on, fifty off, six reps — about ten minutes. Most days, and twice a day if the two are ≥6 h apart. It should never feel hard.',
      progression: 'Frequency first, then a slightly smaller edge. Never to failure.',
      regression: 'Fewer reps; it is already the lowest tier in the library.',
      termination: 'Any finger pain, any day.',
      note: 'Low-intensity, high-frequency finger loading. Emil Abrahamsson popularised this format; the underlying rationale (short, frequent, sub-maximal bouts, ~6 h apart) is extrapolated from in-vitro collagen work rather than shown in human tendon.',
    },
    {
      id: 'F5',
      name: 'Finger warm-up',
      name_no: 'Fingeroppvarming',
      category: 'warmup',
      sessionCat: 'warmup',
      tier: 1,
      intensity: { anchor: 'pctMaxTotal', lo: 0.4, hi: 0.75, edge_mm: 20, grip: 'halfcrimp' },
      volume: { work_s: 10, reps: 5, sets: 1, rest_s: 75 },
      durationTarget_min: 12,
      rpeTarget: { body: 2, finger: 4 },
      expectedDose: 5,
      fingerCost: 'low',
      needs: ['hangboard'],
      loads: ['fingers'],
      minYearsClimbing: 0,
      youth: 'allowed',
      warmup: 'general',
      time: '10 s',
      reps: '5, ascending',
      sets: '1',
      rest: '60–90 s',
      load: '40% → 50% → 60% → 70% → 75% of max total load',
      edge: '20 mm',
      how: 'Five ascending 10-second hangs after 5 minutes of general movement and ten easy pulls on jugs. This is the mandatory warm-up before any maximal finger session — not an optional extra.',
      termination: 'If 75% feels heavy today, the max session is not on. Do F4 instead.',
    },
    {
      id: 'F6',
      name: 'Grip variety hangs',
      name_no: 'Grepsvariasjon',
      sessionCat: 'fingerStrength',
      tier: 4,
      intensity: { anchor: 'pctMaxTotal', lo: 0.8, hi: 0.85, edge_mm: 20, grip: 'rotating' },
      volume: { work_s: 10, reps: 1, sets: 4, rest_s: 300 },
      durationTarget_min: 30,
      rpeTarget: { body: 5, finger: 8 },
      expectedDose: 35,
      fingerCost: 'high',
      needs: ['hangboard'],
      loads: ['fingers'],
      contraindicated: ['fingers'],
      minYearsClimbing: 2,
      youth: 'allowed_reduced',
      warmup: 'finger_full',
      time: '10 s',
      reps: '1',
      sets: '4',
      rest: '5 min',
      load: '80–85% of the max total load *for that grip*',
      edge: '20 mm',
      how: 'F1’s structure, cycling the grip across the block: week A half-crimp, week B three-finger open hand, week C pinch (see F7). Half-crimp and open-hand maxima commonly differ by ~20%, so prescribing both off one number under-loads one and over-loads the other.',
      progression: 'Per grip, as F1. Test each grip separately.',
      regression: 'Drop to 70–75% or to F4.',
      termination: 'As F1.',
      note: 'Needs a per-grip max. Without one the coach falls back to the half-crimp number and says so.',
    },
    {
      id: 'F7',
      name: 'Pinch block',
      name_no: 'Pinch',
      sessionCat: 'fingerStrength',
      tier: 3,
      intensity: { anchor: 'pctMaxTotal', lo: 0.8, hi: 0.85, grip: 'pinch' },
      volume: { work_s: 10, reps: 1, sets: 4, rest_s: 180 },
      durationTarget_min: 20,
      rpeTarget: { body: 4, finger: 7 },
      expectedDose: 18,
      fingerCost: 'medium',
      needs: ['hangboard'],
      loads: ['fingers'],
      minYearsClimbing: 1,
      youth: 'allowed',
      warmup: 'finger_full',
      time: '10 s',
      reps: '1 per hand',
      sets: '4',
      rest: '3 min',
      load: '80–85% of pinch max total load',
      how: 'Pinch lifts or a pinch block, each hand. Pinch loads the thumb and does not stress the A2/A4 pulleys the way crimping does, so it is the useful finger session on a day when crimp-specific loading is contraindicated.',
      progression: 'Add load as F1, per hand.',
      regression: 'Lighter block, same structure.',
      termination: 'Any thumb or wrist pain.',
    },
  ],
  { category: 'finger' },
)

// ---------------------------------------------------------------------------
// rope
// ---------------------------------------------------------------------------

export const ROPE_EXERCISES = build(
  [
    {
      id: 'K1',
      name: 'Projecting / attempts',
      name_no: 'Prosjektering / støting',
      sessionCat: 'hardRope',
      tier: 5,
      gradeContext: 'outdoor',
      gradeOffset: [-1, 0],
      volume: { rest_s: 900 },
      durationTarget_min: 120,
      rpeTarget: { body: 9, finger: 8 },
      pump: [4, 5],
      expectedDose: 55,
      fingerCost: 'high',
      needs: ['rope'],
      loads: ['fingers'],
      style: 'outdoor',
      minYearsClimbing: 1,
      warmup: 'finger_full',
      rest: '≥15 min between burns',
      how: 'Project 2–4 routes with real rest — at least 15 minutes between attempts. The rest is the point: you are training hard moves, not endurance.',
      termination: 'When attempts stop getting better, the session is over.',
      note: 'The ≥15 min rest is the most-violated instruction in projecting sessions. Time it.',
    },
    {
      id: 'K2',
      name: '10 min on, 10 min off',
      name_no: '10 min på, 10 min av',
      sessionCat: 'volumeRope',
      tier: 2,
      gradeContext: 'indoor',
      gradeOffset: [-5, -4],
      volume: { work_s: 600, sets: 4, rest_s: 600 },
      durationTarget_min: 90,
      rpeTarget: { body: 5, finger: 4 },
      pump: [1, 2],
      expectedDose: 18,
      fingerCost: 'medium',
      needs: ['rope'],
      how: 'Stay on the wall for 10 minutes without coming near the ground — up and down until the time is up — then 10 minutes rest. Repeat 3–4 times, on autobelay or toprope. You should not get badly pumped.',
    },
    {
      id: 'K3',
      name: 'Hard–Easy',
      name_no: 'Hard–lett',
      sessionCat: 'pump',
      tier: 3,
      gradeContext: 'indoor',
      gradeOffset: [-2, 0],
      volume: { sets: 5, rest_s: 300 },
      durationTarget_min: 90,
      rpeTarget: { body: 7, finger: 7 },
      pump: [3, 3],
      expectedDose: 30,
      fingerCost: 'medium',
      needs: ['rope'],
      rest: '5 min between sets',
      how: 'A hard and an easy route on the same line or close together. Climb the hard route, then straight onto the easy one with no rest — the easy route is where you try to climb the pump out. Repeat 5 times.',
    },
    {
      id: 'K4',
      name: 'Hard–Hard',
      name_no: 'Hard–hard',
      sessionCat: 'pump',
      tier: 4,
      gradeContext: 'indoor',
      gradeOffset: [-2, -1],
      volume: { sets: 5, rest_s: 120 },
      durationTarget_min: 90,
      rpeTarget: { body: 8, finger: 8 },
      pump: [3, 4],
      expectedDose: 42,
      fingerCost: 'high',
      needs: ['rope'],
      rest: 'Short between sets',
      how: 'Same idea as Hard–Easy, but both routes are hard. Little rest between sets, 5 sets.',
      regression: 'K3 Hard–Easy.',
    },
    {
      id: 'K5',
      name: 'Up–Down–Up',
      name_no: 'Opp-ned-opp',
      sessionCat: 'pump',
      tier: 4,
      gradeContext: 'indoor',
      gradeOffset: [-3, -2],
      volume: { sets: 5, rest_s: 0 },
      durationTarget_min: 75,
      rpeTarget: { body: 8, finger: 8 },
      pump: [3, 4],
      expectedDose: 38,
      fingerCost: 'high',
      needs: ['rope'],
      rest: 'None within a set',
      how: 'Pick a medium-hard route. Climb it up, down, and up again with no rest in between. Repeat 5 times.',
      regression: 'K6 3 in a row.',
    },
    {
      id: 'K6',
      name: '3 in a row',
      name_no: '3 på rappen',
      sessionCat: 'pump',
      tier: 3,
      gradeContext: 'indoor',
      gradeOffset: [-3, -2],
      volume: { sets: 5, rest_s: 0 },
      durationTarget_min: 75,
      rpeTarget: { body: 7, finger: 7 },
      pump: [3, 3],
      expectedDose: 30,
      fingerCost: 'medium',
      needs: ['rope'],
      rest: 'None within a set',
      how: 'Pick a medium-hard route and climb it three times back to back with no rest. Repeat 5 times.',
    },
    {
      id: 'K7',
      name: 'Normal lead climbing',
      name_no: 'Vanlig ledklatring',
      sessionCat: 'volumeRope',
      tier: 3,
      gradeContext: 'indoor',
      gradeOffset: [-3, -1],
      volume: { rest_s: 750 },
      durationTarget_min: 120,
      rpeTarget: { body: 6, finger: 6 },
      pump: [2, 3],
      expectedDose: 26,
      fingerCost: 'medium',
      needs: ['rope'],
      style: 'comp',
      rest: '10–15 min',
      how: 'Climb 6–10 routes including warm-ups. Reasonable rests, but no need for more than 10–15 minutes.',
    },
    {
      id: 'K8',
      name: 'Fall practice',
      name_no: 'Fallteknikk',
      sessionCat: 'mental',
      category: 'mental',
      tier: 1,
      durationTarget_min: 45,
      rpeTarget: { body: 3, finger: 2 },
      pump: [1, 1],
      expectedDose: 5,
      fingerCost: 'low',
      needs: ['rope'],
      minYearsClimbing: 0,
      youth: 'allowed',
      how: 'Progressive falls with a trusted belayer: clipped at the waist, then just above the bolt, then committing falls. Stop while it is still controlled — the point is recalibrating what a fall feels like, not enduring it.',
      note: 'Fear of falling is a trainable skill and one of the most common limiters on overhanging terrain. Zero finger cost, so it fits on a day when everything else is contraindicated.',
    },
  ],
  { category: 'rope' },
)

// ---------------------------------------------------------------------------
// bouldering
// ---------------------------------------------------------------------------

export const BOULDER_EXERCISES = build(
  [
    {
      id: 'B1',
      name: 'Circuit — short',
      name_no: 'Sirkling 1',
      sessionCat: 'pump',
      tier: 4,
      gradeContext: 'spray',
      gradeOffset: null,
      volume: { reps: 5, rest_s: 600 },
      durationTarget_min: 75,
      rpeTarget: { body: 8, finger: 7 },
      pump: [4, 5],
      expectedDose: 34,
      fingerCost: 'medium',
      needs: ['spraywall'],
      loads: ['fingers'],
      how: 'Set a circuit of 25–30 moves on a training wall and climb it 4–6 times, resting about 10 minutes or until recovered. Prescribed in moves, not grades — a home-set spray wall has no meaningful grade.',
    },
    {
      id: 'B2',
      name: 'Circuit — long',
      name_no: 'Sirkling 2',
      sessionCat: 'pump',
      tier: 3,
      gradeContext: 'spray',
      gradeOffset: null,
      volume: { reps: 5, rest_s: 600 },
      durationTarget_min: 75,
      rpeTarget: { body: 7, finger: 6 },
      pump: [3, 4],
      expectedDose: 28,
      fingerCost: 'medium',
      needs: ['spraywall'],
      loads: ['fingers'],
      how: 'Set a circuit of 40–50 moves and climb it 4–6 times. Rest about 10 minutes — you do not need to be fully recovered.',
    },
    {
      id: 'B3',
      name: '4×4',
      name_no: '4×4',
      sessionCat: 'pump',
      tier: 4,
      gradeContext: 'indoor',
      gradeOffset: [-4, -3],
      volume: { sets: 4, reps: 4, rest_s: 510 },
      durationTarget_min: 60,
      rpeTarget: { body: 8, finger: 8 },
      pump: [4, 5],
      expectedDose: 40,
      fingerCost: 'high',
      rest: '7–10 min between blocks',
      how: 'Four hard boulders, each climbed 4 times in a row with a minute per attempt — if the climb takes 30 seconds you get 30 seconds rest. After the fourth go, rest 7–10 minutes.',
      regression: 'B4 10×3.',
    },
    {
      id: 'B4',
      name: '10×3',
      name_no: '10×3',
      sessionCat: 'volumeBoulder',
      tier: 3,
      gradeContext: 'indoor',
      gradeOffset: [-5, -4],
      volume: { sets: 10, reps: 3 },
      durationTarget_min: 75,
      rpeTarget: { body: 7, finger: 7 },
      pump: [3, 4],
      expectedDose: 32,
      fingerCost: 'medium',
      rest: 'Climbing time equals rest time',
      how: 'Ten medium-to-hard boulders, each climbed 3 times in a row with no rest; climbing time equals rest time, so keep a watch. Adjust the grade to your form — all 3 goes should ideally go, and at least 2 must.',
    },
    {
      id: 'B5',
      name: 'Max bouldering on the training wall',
      name_no: 'Maks buldring på treningsvegg',
      sessionCat: 'hardBoulder',
      tier: 5,
      gradeContext: 'board',
      gradeOffset: [-1, 0],
      volume: { reps: 4, rest_s: 240 },
      durationTarget_min: 60,
      rpeTarget: { body: 9, finger: 9 },
      pump: [2, 3],
      expectedDose: 55,
      fingerCost: 'high',
      needs: ['spraywall'],
      loads: ['fingers'],
      contraindicated: ['fingers'],
      style: 'outdoor',
      minYearsClimbing: 2,
      warmup: 'finger_full',
      rest: '3–5 min between attempts',
      how: 'On the training board. Start on a boulder and give it a few goes — at most 4 attempts in 15 minutes — then move on. You should send it or be close after a few tries. These should be finger-heavy.',
      regression: 'B9 normal bouldering.',
      termination: 'When you stop making progress on a problem, move on or stop.',
    },
    {
      id: 'B6',
      name: 'Easy bouldering',
      name_no: 'Rolig buldring',
      sessionCat: 'lowIntBoulder',
      tier: 2,
      gradeContext: 'indoor',
      gradeOffset: [-4, -3],
      volume: { sets: 5, reps: 3, rest_s: 120 },
      durationTarget_min: 60,
      rpeTarget: { body: 5, finger: 5 },
      pump: [1, 2],
      expectedDose: 14,
      fingerCost: 'low',
      rest: '2 min between goes, 5 min between boulders',
      how: 'Five boulders, three times each, a few grades below your max. Focus on what you can improve on each attempt.',
    },
    {
      id: 'B7',
      name: 'Technique bouldering',
      name_no: 'Teknikkbuldring',
      sessionCat: 'lowIntBoulder',
      tier: 1,
      gradeContext: 'indoor',
      gradeOffset: [-6, -4],
      durationTarget_min: 60,
      rpeTarget: { body: 4, finger: 3 },
      pump: [1, 2],
      expectedDose: 8,
      fingerCost: 'low',
      style: 'comp',
      rest: 'As needed',
      how: 'A relatively easy session on set boulders or ones you make up to challenge your technique. Good holds — you should not get tired, but it should still be hard. Slab and coordination boulders.',
    },
    {
      id: 'B8',
      name: 'Boulder projecting',
      name_no: 'Prosjektering',
      sessionCat: 'hardBoulder',
      tier: 5,
      gradeContext: 'indoor',
      gradeOffset: [-1, 0],
      volume: { rest_s: 300 },
      durationTarget_min: 60,
      rpeTarget: { body: 9, finger: 9 },
      pump: [2, 3],
      expectedDose: 50,
      fingerCost: 'high',
      loads: ['fingers'],
      contraindicated: ['fingers'],
      style: 'outdoor',
      minYearsClimbing: 1,
      warmup: 'finger_full',
      rest: '≥5 min between attempts',
      how: 'Project 3–5 boulders at your max level with good rest between attempts. Training board or set boulders.',
      regression: 'B9 normal bouldering.',
    },
    {
      id: 'B9',
      name: 'Normal bouldering',
      name_no: 'Vanlig buldring',
      sessionCat: 'volumeBoulder',
      tier: 3,
      gradeContext: 'indoor',
      gradeOffset: [-4, -2],
      durationTarget_min: 90,
      rpeTarget: { body: 6, finger: 6 },
      pump: [2, 3],
      expectedDose: 28,
      fingerCost: 'medium',
      rest: 'Free',
      how: 'Free bouldering on set boulders, mostly a couple of grades below your limit. Prescribable now: without a grade band and a duration this was the one session the coach could not reason about at all.',
    },
    {
      id: 'B10',
      name: 'Campus bouldering',
      name_no: 'Campus buldring',
      sessionCat: 'hardBoulder',
      tier: 5,
      gradeContext: 'board',
      gradeOffset: [-3, -2],
      volume: { reps: 2, rest_s: 210 },
      durationTarget_min: 25,
      rpeTarget: { body: 9, finger: 9 },
      pump: [2, 3],
      expectedDose: 45,
      fingerCost: 'high',
      needs: ['spraywall'],
      loads: ['fingers', 'elbow', 'shoulder'],
      contraindicated: ['fingers', 'elbow', 'shoulder'],
      style: 'outdoor',
      minYearsClimbing: 4,
      // Same gate as F3: this is campus loading whatever wall it happens on.
      youth: 'blocked',
      warmup: 'finger_full',
      rest: '3–4 min',
      how: 'Make up campus boulders on the training wall, 6–15 moves each. Experiment, and try at least 2 different ones.',
      termination: 'Stop at the first uncontrolled catch.',
    },
    {
      id: 'B11',
      name: 'Climb 50 boulders',
      name_no: 'Gå 50 bulder',
      sessionCat: 'volumeBoulder',
      tier: 2,
      gradeContext: 'indoor',
      gradeOffset: [-6, -4],
      durationTarget_min: 90,
      rpeTarget: { body: 6, finger: 4 },
      pump: [2, 3],
      expectedDose: 20,
      fingerCost: 'medium',
      rest: 'Free',
      how: 'Bring paper and a pencil and climb at least 50 boulders — warm-ups count. Cover every style: crimps, jugs, slopers.',
    },
    {
      id: 'B12',
      name: 'Coordination bouldering',
      name_no: 'Koordinasjonsbuldring',
      sessionCat: 'lowIntBoulder',
      tier: 2,
      gradeContext: 'indoor',
      gradeOffset: [-5, -3],
      durationTarget_min: 60,
      rpeTarget: { body: 6, finger: 3 },
      pump: [1, 2],
      expectedDose: 10,
      fingerCost: 'low',
      loads: ['shoulder'],
      style: 'comp',
      youth: 'allowed',
      how: 'Dynos, run-and-jumps, paddle moves, double-clutches. High skill, low finger load — and the exact content modern competition setting is full of. Stop when the landings stop being controlled.',
      termination: 'Stop when you start landing badly; this is a coordination session, not a power one.',
    },
    {
      id: 'B13',
      name: 'Slab & footwork',
      name_no: 'Sva / fotarbeid',
      sessionCat: 'lowIntBoulder',
      tier: 1,
      gradeContext: 'indoor',
      gradeOffset: [-6, -4],
      durationTarget_min: 50,
      rpeTarget: { body: 4, finger: 2 },
      pump: [1, 1],
      expectedDose: 6,
      fingerCost: 'low',
      style: 'comp',
      how: 'Friction, precision footwork, balance. Near-zero finger load, which makes it one of the few real climbing sessions available on a tired-finger day.',
    },
    {
      id: 'B14',
      name: 'Mantles & pressing',
      name_no: 'Mantel og press',
      sessionCat: 'lowIntBoulder',
      tier: 2,
      gradeContext: 'indoor',
      gradeOffset: [-5, -3],
      durationTarget_min: 50,
      rpeTarget: { body: 6, finger: 3 },
      pump: [1, 2],
      expectedDose: 12,
      fingerCost: 'low',
      loads: ['shoulder'],
      how: 'Topouts, mantles, compression and pressing. Trains a weakness nothing else in the library touches — climbers are overwhelmingly pull-trained, and comp setting punishes it.',
    },
    {
      id: 'C1',
      name: 'Competition simulation — boulder qualification',
      name_no: 'Konkurransesimulering — kvalifisering',
      sessionCat: 'hardBoulder',
      tier: 5,
      gradeContext: 'indoor',
      gradeOffset: [-2, 0],
      volume: { sets: 5, work_s: 300, rest_s: 300 },
      durationTarget_min: 90,
      rpeTarget: { body: 9, finger: 8 },
      pump: [3, 4],
      expectedDose: 48,
      fingerCost: 'high',
      loads: ['fingers'],
      style: 'comp',
      minYearsClimbing: 1,
      warmup: 'finger_full',
      sets: '5 unseen boulders',
      time: '5 min on',
      rest: '5 min between',
      how: 'Five boulders you have not seen or watched. Five minutes on each, then the same rest, in order. No beta, no second visit — when the clock goes you move on whether or not you topped it. Self-judge tops and zones.',
    },
    {
      id: 'C2',
      name: 'Flash session',
      name_no: 'Flash-økt',
      sessionCat: 'hardBoulder',
      tier: 4,
      gradeContext: 'indoor',
      gradeOffset: [-2, -1],
      durationTarget_min: 75,
      rpeTarget: { body: 7, finger: 7 },
      pump: [2, 3],
      expectedDose: 30,
      fingerCost: 'medium',
      style: 'comp',
      how: 'Pick 8–12 boulders you have never tried, around your flash grade. One attempt each — send it or not, you move on. Read every one from the ground before you touch it. The skill is choosing the right beta first time, not trying hard.',
    },
    {
      id: 'C4',
      name: 'Competition simulation — boulder final',
      name_no: 'Konkurransesimulering — finale',
      sessionCat: 'hardBoulder',
      tier: 5,
      gradeContext: 'indoor',
      gradeOffset: [-1, 0],
      volume: { sets: 4, work_s: 270, rest_s: 270 },
      durationTarget_min: 90,
      rpeTarget: { body: 9, finger: 9 },
      pump: [3, 4],
      expectedDose: 50,
      fingerCost: 'high',
      loads: ['fingers'],
      style: 'comp',
      minYearsClimbing: 1,
      warmup: 'finger_full',
      sets: '4 unseen boulders',
      time: '8 min collective observation, then 4–5 min on',
      rest: '4–5 min between',
      how: 'Four unseen boulders. First an 8-minute collective observation of all four from the ground — no touching — then 4–5 minutes on each with equal rest. Reading four problems cold in eight minutes is a distinct skill and nothing else in the library trains it.',
      note: 'Models the current World Climbing (IFSC) final format.',
    },
    {
      id: 'C5',
      name: 'Single-burn practice',
      name_no: 'Finalestøt',
      sessionCat: 'hardBoulder',
      tier: 5,
      gradeContext: 'indoor',
      gradeOffset: [-1, 0],
      volume: { reps: 2, rest_s: 1800 },
      durationTarget_min: 60,
      rpeTarget: { body: 9, finger: 9 },
      pump: [1, 2],
      expectedDose: 35,
      fingerCost: 'high',
      loads: ['fingers'],
      style: 'comp',
      warmup: 'finger_full',
      rest: 'Long and deliberately uncomfortable',
      how: 'One or two attempts at your limit after a long, deliberately uncomfortable rest — 30+ minutes of sitting around, then perform cold. The single cold burn decides finals and no ordinary session rehearses it.',
    },
    {
      id: 'C6',
      name: 'Long-rest practice',
      name_no: 'Lang pause-trening',
      sessionCat: 'hardBoulder',
      tier: 4,
      gradeContext: 'indoor',
      gradeOffset: [-2, -1],
      volume: { sets: 2, rest_s: 4050 },
      durationTarget_min: 150,
      rpeTarget: { body: 8, finger: 8 },
      pump: [2, 3],
      expectedDose: 38,
      fingerCost: 'high',
      loads: ['fingers'],
      style: 'comp',
      warmup: 'finger_full',
      rest: '45–90 min of genuine downtime',
      how: 'A hard effort, then 45–90 minutes of real downtime — sit down, eat, get cold — then another hard effort. Rehearses the qualification-to-semi gap, which is where competitions are quietly lost.',
    },
    {
      id: 'W1',
      name: 'Set your own boulders',
      name_no: 'Sett egne bulder',
      sessionCat: 'lowIntBoulder',
      tier: 1,
      gradeContext: 'board',
      gradeOffset: [-6, -4],
      durationTarget_min: 90,
      rpeTarget: { body: 5, finger: 4 },
      pump: [1, 2],
      expectedDose: 10,
      fingerCost: 'low',
      needs: ['spraywall'],
      how: 'Set at least 5 good warm-up boulders — at least one per wall. Use these every session from now on: over time they become your daily-form gauge, because you learn how they should feel. If you have energy left, set a few projects too.',
      note: 'The warm-up boulders are a free daily readiness probe — see the "how did the warm-up feel" rating at the start of a session.',
    },
  ],
  { category: 'boulder' },
)

// C3 is a rope session but belongs to the competition set; it lives with the
// rope exercises for library browsing.
ROPE_EXERCISES.push(
  ...build(
    [
      {
        id: 'C3',
        name: 'Competition simulation — lead',
        name_no: 'Konkurransesimulering — led',
        sessionCat: 'hardRope',
        tier: 5,
        gradeContext: 'indoor',
        gradeOffset: [-2, 0],
        volume: { sets: 2, work_s: 360 },
        durationTarget_min: 90,
        rpeTarget: { body: 9, finger: 8 },
        pump: [4, 5],
        expectedDose: 40,
        fingerCost: 'medium',
        needs: ['rope'],
        style: 'comp',
        warmup: 'finger_full',
        time: '6 min',
        sets: '1–2 routes',
        rest: 'Full rest between',
        how: 'One route you have not seen and have not watched anyone on. Six minutes of observation from the ground, then one attempt under onsight rules — a fall ends it. What you are training is reading and pacing under pressure, not fitness.',
      },
    ],
    { category: 'rope' },
  ),
)

// ---------------------------------------------------------------------------
// strength
// ---------------------------------------------------------------------------

export const GYM_EXERCISES = build(
  [
    { id: 'S1', name: 'Weighted pull-ups', loads: ['shoulder', 'elbow'], reps: '3–5', sets: '3–5', load: '80–90% of 1RM', rest: '3–6 min', tier: 4, expectedDose: 6, fingerCost: 'low', minYearsClimbing: 1 },
    { id: 'S2', name: 'Lock-off', loads: ['shoulder', 'elbow'], reps: '5–10 s', sets: '3–4', load: '−10 kg assist', rest: '3–6 min', tier: 3, expectedDose: 5, fingerCost: 'low' },
    { id: 'S3', name: 'One-arm pull on rings', loads: ['shoulder', 'elbow'], reps: '4–8', sets: '3–5', rest: '3–6 min', tier: 5, expectedDose: 8, fingerCost: 'low', youth: 'blocked', minYearsClimbing: 4 },
    { id: 'S4', name: 'Row', loads: ['shoulder', 'elbow'], reps: '3–5', sets: '3–5', load: 'Test yourself', rest: '3–6 min', tier: 3, expectedDose: 3 },
    { id: 'S5', name: 'Kettlebell shoulder press', loads: ['shoulder'], reps: '5–8', sets: '3–4', load: 'Test yourself', rest: '3–6 min', tier: 3, expectedDose: 2, how: 'Bottoms-up — the heavy end pointing upward.' },
    { id: 'S6', name: 'Flies in slings', loads: ['shoulder'], reps: '5–8', sets: '3–5', rest: '3–6 min', tier: 3, expectedDose: 2 },
    { id: 'S7', name: 'Squats', reps: '3–5', sets: '3–5', load: 'Test yourself', rest: '3–6 min', tier: 3, expectedDose: 1 },
    { id: 'S8', name: 'Deadlift', reps: '3–5', sets: '3–5', load: 'Test yourself', rest: '2–5 min', tier: 4, expectedDose: 1 },
    { id: 'S8b', name: 'Toes to bar', loads: ['back'], reps: '6–12', sets: '3–5', rest: '3–6 min', tier: 3, expectedDose: 2 },
    { id: 'S9', name: 'Toes to sky', loads: ['back'], reps: '4–8', sets: '3–5', rest: '3–6 min', tier: 3, expectedDose: 1 },
    { id: 'S10', name: 'Superman in slings', loads: ['back', 'shoulder'], reps: '4–8', sets: '3–5', rest: '2–4 min', tier: 3, expectedDose: 2 },
    { id: 'S11', name: 'Worm in slings', loads: ['back'], reps: '8–12', sets: '3–5', rest: '2–4 min', tier: 3, expectedDose: 2 },
    {
      id: 'S12', name: 'Shoulder external rotations', reps: '5–10', sets: '3–5',
      load: 'Light — this is prehab, not a lift', rest: '2–3 min',
      rehabFor: ['shoulder'], tier: 1, expectedDose: 0, youth: 'allowed',
      how: 'Climbing is overwhelmingly pull-dominant, and low external-rotation strength relative to internal is one of the more consistent shoulder-injury associations. Worth keeping in year-round.',
    },
    {
      id: 'S15', name: 'Wrist extensor & flexor eccentrics', reps: '10–15', sets: '3',
      load: 'Light dumbbell or a rubber bar', rest: '2 min',
      rehabFor: ['elbow', 'wrist'], tier: 1, expectedDose: 0, youth: 'allowed',
      how: 'Forearm supported, lower the weight slowly (3–4 s) and help it back up with the other hand. Extensors for lateral elbow pain, flexors for medial "climber\'s elbow". Slow and light — the eccentric is the point, load is not.',
    },
    {
      id: 'S13', name: 'Circuit', reps: '10–20', sets: '5', rest: 'Max 2 min', tier: 3, expectedDose: 3,
      how: 'Pull-ups, sit-ups, jumping squats, push-ups. As many reps as you can with as little rest as possible — closer to an endurance session than pure strength.',
    },
    {
      id: 'S14', name: 'Pyramid', sets: '1 pyramid', rest: 'Minimal', tier: 3, expectedDose: 3,
      how: 'Pull-ups, sit-ups, jumping squats, push-ups. Set 1 is one rep of each, set 2 is two, up to ten, then back down — 100 reps of each. Finish as fast as you can.',
    },
  ],
  {
    category: 'strength',
    sessionCat: 'strength',
    needs: ['gym'],
    durationTarget_min: 60,
    fingerCost: 'none',
    warmup: 'shoulder',
  },
)

// ---------------------------------------------------------------------------
// mobility
// ---------------------------------------------------------------------------

export const STRETCH_EXERCISES = build(
  [
    { id: 'T1', name: 'Butterfly', how: 'Sit with the soles of your feet together and knees out to the sides, working the knees toward the floor.' },
    { id: 'T2', name: 'Frog', how: 'Knees and elbows on the floor, stretching the inner thigh.' },
    { id: 'T3', name: 'Splits', how: 'Sit in the splits and move slowly from side to side with your upper body.' },
    { id: 'T4', name: 'Hamstring', how: 'Sitting or standing, stretch the hamstring.' },
    { id: 'T5', name: 'Back', how: 'On your back, lift one straight leg up and across to the opposite side, keeping both shoulders down. Then lie on your front and do the same.' },
  ],
  {
    category: 'mobility',
    sessionCat: 'mobility',
    tier: 1,
    fingerCost: 'none',
    durationTarget_min: 20,
    expectedDose: 0,
    hold: '2 min',
    sets: '2',
    rest: '2 min',
  },
)

// ---------------------------------------------------------------------------
// mental
// ---------------------------------------------------------------------------
// Zero injury risk and zero finger dose, which makes these the only real
// content available on a day when everything else is contraindicated. The
// low-finger fallback rotation includes them for exactly that reason.

export const MENTAL_EXERCISES = build(
  [
    {
      id: 'M1', name: 'Visualisation', name_no: 'Visualisering', durationTarget_min: 15,
      how: 'Rehearse a route or boulder move by move with your eyes closed, in real time — not fast-forwarded. Include the parts you usually fall on, and rehearse doing them well.',
    },
    {
      id: 'M2', name: 'Competition-day routine', name_no: 'Konkurransedag-rutine', durationTarget_min: 20,
      how: 'Write and rehearse the sequence of the day: when you eat, when you warm up, what you do in isolation, what you do between problems. A routine is what you fall back on when the nerves arrive.',
    },
    {
      id: 'M3', name: 'Process goals before a session', name_no: 'Prosessmål før økt', durationTarget_min: 5,
      how: 'Before the session, write down two things you control — foot precision, resting on the route, committing to the first attempt. Review them afterwards instead of the result.',
    },
    {
      id: 'M4', name: 'Wind-down / mindfulness', name_no: 'Nedtrapping / mindfulness', durationTarget_min: 15,
      how: 'Ten to fifteen minutes of breathing or body scan, ideally after training or before bed. The point is the off-switch, which is the part climbers with a competition coming up lose first.',
    },
  ],
  {
    category: 'mental',
    sessionCat: 'mental',
    tier: 1,
    fingerCost: 'none',
    expectedDose: 0,
    needs: [],
    youth: 'allowed',
  },
)

// ---------------------------------------------------------------------------
// assembly
// ---------------------------------------------------------------------------

export const ALL_EXERCISES = [
  ...FINGER_EXERCISES,
  ...ROPE_EXERCISES,
  ...BOULDER_EXERCISES,
  ...GYM_EXERCISES,
  ...STRETCH_EXERCISES,
  ...MENTAL_EXERCISES,
]

export const EXERCISE_MAP = Object.fromEntries(ALL_EXERCISES.map((e) => [e.id, e]))

// The library sessions a logged session was made of. A real gym session is
// often several: slab, then campus, then 4x4s - and a mobility session is a
// routine of stretches, never one. Sessions logged before this was a list hold
// a single `exercise`, so both shapes are read here rather than at each of the
// four call sites.
export function sessionExercises(session) {
  const c = session?.extra?.coach
  const ids = Array.isArray(c?.exercises) ? c.exercises : c?.exercise ? [c.exercise] : []
  return ids.map((id) => EXERCISE_MAP[id]).filter(Boolean)
}

export const STRETCH_PROTOCOL =
  'Hold each for 2 minutes with at least 2 minutes rest, twice through.'

// Exercises in a (category, tier) cell of the grid, nearest tier first.
export function exercisesAt(sessionCat, tier) {
  return ALL_EXERCISES.filter((e) => e.sessionCat === sessionCat).sort(
    (a, b) => Math.abs(a.tier - tier) - Math.abs(b.tier - tier) || b.tier - a.tier,
  )
}

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
      boulderLow: { text: 'Visualisation and drilling. In a new gym: climb at least 20 boulders (some more than once), ideally technically demanding ones. Repeat technical moves 3 times in a row if you don’t flash them easily.' },
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
      boulderLow: { text: 'Slab.', ex: 'B13' },
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
      boulderLow: { text: 'Footwork.', ex: 'B13' },
      boulderVolume: { text: 'Drilling moves.' },
    },
  },
]
