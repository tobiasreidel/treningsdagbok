# Treningsdagbok: the climbing side, in full

A handoff document. Everything this app knows, logs, computes and shows about
climbing, plus how it looks and reads to the person using it. Written to be
handed to someone (or something) that has never seen the codebase, so they can
redesign the UI or check the facts without reading the source.

Sources of truth in the repo, if you have it: `src/lib/coach.js` (the engine),
`src/lib/fingerLoad.js` (the load arithmetic), `src/lib/exercises.js` (the
library), `src/lib/fingerTests.js` (the test battery), `src/lib/stats.js` (the
charts), `supabase/migrations/` (the schema), `docs/coach-spec.md` (the older design
spec, v3, partly superseded by this document).

Two things to know before reading:

1. **Nothing here is a prediction.** The app never outputs an injury
   probability or a risk score, on purpose. It reports what the logged data
   says and what it would therefore do.
2. **Many numbers are chosen, not measured.** The document marks them.
   Section 13 is a list of every claim worth fact-checking, separated into
   "this is a real finding", "this is a chosen constant", and "this looks like
   a bug".

---

## 1. What the app is

A personal multi-sport training diary, shipped as an installable PWA. Six
sports: cycling, running, swimming, climbing, strength, finger. Climbing and
finger are the ones with a coach behind them.

- **Audience**: the owner plus a handful of friends. Not a product. Scale
  decisions are made for a dozen users, not a thousand.
- **Stack**: React 18 + Vite + React Router. Supabase (Postgres, auth,
  storage) is the entire backend. Two Vercel functions exist (account
  deletion, feedback); everything else talks to Postgres directly under row
  level security.
- **Everything is client-side.** The coach is pure arithmetic over rows
  fetched into the browser. No model, no server component, no inference.
- **Offline-first.** Sessions are cached in IndexedDB and writes are queued in
  an outbox, so the diary opens in a gym basement.
- **Units are metric.** Dates are ISO `yyyy-MM-dd` strings everywhere.
- **Grades are French/Fontainebleau only.** Boulder grades are uppercase
  (`8B+`), route grades lowercase (`8b+`). No V-scale, no YDS, no conversion.

### Copy voice

The app is written for climbers, not clinicians. House rules, worth keeping if
you rewrite anything:

- Plain language. No jargon that the user has not already met on a wall.
- No em dashes anywhere. Use a colon, a comma, a semicolon or two sentences.
- Say a thing once. A hint that only restates its own label gets deleted.
- The coach never gives an injury-risk number and always says pain is the real
  signal.
- Explanations say *why*, not just *what*: "connective tissue adapts slower
  than muscle" rather than "rest more".

---

## 2. Screen map

Bottom tab bar (5 items, `Log` is the raised primary): **Home**, **Logbook**,
**Log**, **Stats**, **Friends**.

Routes relevant to climbing:

| Route | Screen | What it is |
|---|---|---|
| `/` | Dashboard | Widgets, week table, the coach's Today card |
| `/new` | Register session | The logging wizard |
| `/session/:id` | Session detail | One logged session, read-only |
| `/session/:id/edit` | Edit session | Same wizard, prefilled |
| `/logbook` | Logbook | Searchable/filterable list of sessions |
| `/stats` | Stats | Per-sport tabs, including Climbing and Finger |
| `/coach` | Coach, Today tab | What to do now and why |
| `/coach/plan` | Coach, The plan tab | Goal, week, cycle, how the plan is built |
| `/coach/tests` | Coach, Tests tab | The test battery |
| `/coach/setup` | About you | The coach's setup form and goals |
| `/coach/library` | Exercise library | All 61 sessions, browsable |
| `/coach/signals/:key` | Signals | `finger` / `readiness` / `load` / `monotony` detail |
| `/coach/simulator` | Simulator | Dev-only bench: a synthetic athlete on sliders, every signal live. Linked from nowhere |
| `/squad` | Squad | A coach's weekly overuse roll-up, for athletes who granted signal access |
| `/checkin` | Check in | Daily wellness (Today tab) and weekly OSTRC (Week tab) |
| `/widgets` | Customize dashboard | Pick dashboard widgets |
| `/settings` | Settings | Sports, coach toggle, gear, privacy, export |

The coach is **off by default**. Settings has a "Training coach BETA" section
with a "Suggest today's session" toggle. With it off, `/coach` and the
dashboard card do not appear.

---

## 3. Visual language

Mobile-first, single column, max width **480px**, centred. Everything is
cards on a tinted background. iOS safe-area aware.

### Tokens (CSS custom properties, `src/styles.css`)

Light (default):

```
--bg #f3f4f8    --surface #ffffff   --surface-2 #eef0f6
--text #1a1d29  --text-muted #6b7280 --border #e4e6ee
--primary #4f46e5  --primary-tint #ecebfb  --primary-ink #ffffff
--radius 16px   --radius-sm 10px    --maxw 480px
--shadow 0 1px 3px rgba(16,24,40,.06), 0 1px 2px rgba(16,24,40,.04)
```

Six themes, chosen via `data-theme` on `<html>`: **System**, **Light**,
**Dark**, **Midnight** (OLED black, violet accent `#8b5cf6`), **Forest** (deep
green, emerald accent `#10b981`), **Sunset**. Dark overrides:
`--bg #0b1020`, `--surface #151b2e`, `--surface-2 #1d2440`, `--text #e7e9f2`,
`--primary #6366f1`, `--shadow none`.

**Sport colours never change with the theme**, so a chart reads the same
everywhere:

| Sport | Colour |
|---|---|
| Cycling | `#f59e0b` |
| Running | `#f43f5e` |
| Swimming | `#06b6d4` |
| Climbing | `#3b82f6` |
| Strength | `#a855f7` |
| Finger | `#ec4899` |
| "Both" / positive | `#22c55e` |
| Danger | `#ef4444` |

Zone colours, cool to hot: `#94a3b8 #38bdf8 #22c55e #f59e0b #ef4444 #a855f7 #ec4899`.

### Tone system

The coach expresses judgment as a colour on a left border or a dot, never as a
number. Five tones map onto three colours:

| Tone | Colour | Used for |
|---|---|---|
| `go` / `good` | `#22c55e` green | Following the plan, fresh, steady |
| `moderate` / `ok` / `warn` | `#f59e0b` amber | Eased session, recovering, above normal |
| `easy` | `#f59e0b` amber | Spare the fingers, recovery day |
| `caution` | `#ef4444` red | Back off, injury, too many hard finger days |

### Shared components

- `Field`: label, optional `· optional` suffix, the control, then a hint line
  below in muted small text.
- `Segmented`: large single-choice buttons in an N-column grid. The primary
  choice control everywhere.
- `PillRow`: horizontal scrolling pill tabs (used for the Coach tabs, the
  library tabs, the signal tabs).
- `Scale`: a 1..N row of numbered buttons with a low label and a high label at
  the ends. Used for feeling (1-5), RPE (1-10), finger RPE (1-10), pump (1-5),
  and the four wellness items (1-5).
- `Chips` / `ChipSelect`: multi-select and single-select chips (grades, send
  types, training weekdays).
- `SignalBlock`: the coach's signal row. A tinted block with a 3px left border
  in the tone colour: title on the left, state on the right, hint underneath.
  With an `onPress` it becomes a button and grows a `›` chevron; the look is
  otherwise identical.
- `ExerciseCard`: one prescribed session. ID pill, name, optional `u18` and
  `pick` tags, the `how` paragraph, an optional `Margin:` line, then a
  metadata grid (Time, Hold, Reps, Sets, Rest, Load, Edge, Duration, Pump) and
  an optional `Stop if:` line.
- `AlternativeRow`: an alternative session as one line: ID, name, `~N min ·
  pump N`, and a `Swap` button.
- `ChartCard`: title, optional big value top-right, the chart, then a note.
- Charts are hand-rolled SVG (`src/components/charts.jsx`): `Bars`, `HBars`,
  `Line`. `null` in a series renders as a gap, never as a zero.
- `beta-tag`: a small "beta" chip next to the coach's name wherever it appears.

---

## 4. What gets stored

### `sessions` (one row per session)

| Column | Notes |
|---|---|
| `date` | ISO date |
| `sport` | `cycling` / `running` / `swimming` / `climbing` / `strength` / `finger` |
| `subtype` | climbing: `bouldering` / `sport` / `trad` |
| `location` | climbing only: `indoor` / `outdoor` |
| `feeling` | 1-5, weak to strong |
| `rpe` | 1-10, whole-body perceived exertion |
| `duration` | minutes |
| `notes`, `photo_url` | free text, one photo in storage |
| `extra` | jsonb, everything sport-specific |

`routes` is a separate table, one row per climb: `name`, `grade`, `send_type`
(`onsight` / `flash` / `redpoint` / `secondgo` / `attempt`).

### `sessions.extra`, the climbing-relevant keys

```js
{
  rpe_finger: 1..10,          // finger/crimp intensity, anchored in the UI
  pump: 1..5,                 // forearm pump
  grades: ['7A','7A+'],       // "Grades worked" chips, climbing sessions
  grading_system: 'french',
  training_load: 123,         // imported TSS when available
  strength_minutes: 30,       // minutes of this session that were strength
  finger_minutes: 20,         // minutes that were finger training
  strength: [ { exercise, sets, reps, weight } ],
  finger: {
    campus: '' | 'board' | 'spray',
    pockets: true,            // two-finger / pocket work
    hangboard: [ {
      hands: 'two' | 'one',
      grip: 'halfcrimp' | 'open3' | 'open4' | 'fullcrimp' | 'pinch',
      reps: '1', rest: '',    // rest in seconds, between reps
      sets: [ { load_total_kg, time, edge } ]   // kg TOTAL, seconds, mm
    } ]
  },
  coach: { followed: 'planned'|'other', type, exercises: ['B5','F1'] },
  test_session: { ids: ['max_hang', ...] }
}
```

**The single most important convention in the app**: hangboard load is stored
as **total kilos, bodyweight included**, and finger-test maxima are recorded
the same way. See section 7.1 for why.

Legacy rows store `sets: [{ weight }]` where `weight` was *added* kg. Those
rows are never rewritten on disk. They are converted at read time once a
bodyweight exists, and the UI says when a set cannot be read at all.

### Coach tables (all strictly private, RLS on `user_id`)

**`coach_profile`** (one row per user):

`birth_year`, `climbing_since`, `max_boulder_outdoor|indoor|board`,
`board_type` (`kilter|moon|tension|spray|other`), `max_route_outdoor|indoor`,
`flash_boulder`, `onsight_route`, `sessions_week` (1-14),
`has_hangboard|has_campus|has_spraywall|has_gym`, `hang_max_kg` (legacy,
added kg), `hang_edge_mm`, `hang_tested_on`, `preferred_days` (ISO weekdays
1-7 array), `bodyweight_kg`, `injury_history` (free text),
`focus` (`boulder|route|both`).

Note the deliberate omission: **there is no bodyweight history and no weight
chart.** Climbing has a documented problem with disordered eating and RED-S,
and a weight trend sitting next to performance numbers is a known harm vector.
The single current value exists only to turn a percentage into kilos. Do not
add a history table.

**`coach_goals`**: `title`, `kind` (`competition|trip|grade|strength|other`),
`target_date`, `discipline` (`boulder|rope|both`), `style` (`comp|outdoor`),
`grade`, `achieved`, `created_at`. Speed climbing is not modelled.

**`wellness_days`** (one row per calendar day): `sleep`, `fatigue`,
`soreness`, `stress`, each 1-5, plus a note.

**`ostrc_reports`** (one row per week per body area): `week_start` (Monday),
`area`, `q1..q4`.

**`finger_tests`**: `tested_on`, `protocol` (`total_load` | `min_edge`),
`grip`, `edge_mm`, `hands` (`two`|`one`), `value`, `value_left`,
`bodyweight_at_test`, `aborted_reason` (`pain`|`skin`|`other`), `notes`.

**`physical_tests`**: `tested_on`, `test_id`, `value`, `unit`, `normalised`,
`side` (`L`|`R`), `aborted_reason`, `notes`.

**`injuries`** (from the health module) gains a `region`:
`fingers|elbow|shoulder|wrist|knee|back|other`.

Local-only, in localStorage, never synced: bodyweight mirror, coach on/off,
periodisation model, today's session pick, HR zones, enabled sports, dashboard
widget choice, avatar emoji, theme.

---

## 5. Logging a climbing session

`/new`. A wizard with a dot progress indicator in the header and a single
full-width primary button in the footer (`Next`, then `Save session`). The
step list is dynamic:

- **strength** → sport, [plan], details, strength, notes
- **finger** → sport, [plan], details, finger, notes
- **climbing** → sport, subtype, [plan], details, then **routes** if outdoor
  or **strength + finger** if indoor, then notes

`[plan]` only appears when the coach is on.

### Step 1, "What did you do?"

Segmented buttons of enabled sports with emoji: 🚴 Cycling, 🏃 Running,
🏊 Swimming, 🧗 Climbing, 💪 Strength, 🤏 Finger.

### Step 2, "Type" and "Where" (climbing)

Three subtype buttons (Bouldering / Sport / Trad) and two location buttons
(Indoor / Outdoor).

### Step 3, "The plan" (coach on)

"Did you do the planned session?" with `The planned session` / `Something
else`. Then a picker: "What did it consist of?" or "What did you do?", with
today's suggestions offered as quick-add chips and the whole library
searchable. **A session can be several library sessions**: slab, then campus,
then 4x4s is one afternoon. Hint: "You can name more than one. A max hangboard
day and easy mileage load the fingers very differently."

### Step 4, "Details"

- **Date**
- **Feeling**, 1-5, Weak to Strong, with a dynamic hint per value.
- **RPE**, 1-10, Easy to Max.
- **Finger RPE** (climbing and finger sessions only), 1-10, optional, with an
  anchored hint that changes as you move it. The anchors exist because an
  unanchored self-report scale drifts over months and this one feeds the
  recovery model:

  | Value | Anchor text |
  |---|---|
  | 2 | jugs, fingers barely involved |
  | 4 | noticeable, nowhere near failing |
  | 6 | small holds, working hard |
  | 8 | failing ON holds, not on moves |
  | 10 | absolute max, skin and tendons feel it |

- **Pump** (climbing and finger sessions only), 1-5, None to Maxed, optional.
  Hint shows the level's name and quality: 1 No pump, 2 Slight, 3 Moderate,
  4 Very pumped, 5 Completely pumped; quality is Endurance up to 3, then
  Endurance/power-endurance, then Strength/power-endurance.
- **Duration** (required) with quick chips 30m/45m/60m/90m/120m, plus optional
  **Warm-up** and **Rehab** minute fields.
- **Grades worked** (climbing), a chip grid of the right scale for the
  subtype. Hint: "French grades".
- **Notes**.

Finger RPE and pump are **two scales on purpose**. Crimping strains pulleys
and tendons, which recover over days. Pump is metabolic and gone in hours. A
pumpy jug circuit and a session of hard crimping can share a whole-body RPE
and leave the fingers in completely different states, and only the finger
number feeds the recovery window.

### Step 5a, "Routes & boulders" (outdoor only)

Repeating cards, each `#N` with a remove button: **Name** (optional),
**Grade** (select of the right scale), **Send** (chips: Onsight, Flash,
Redpoint, 2. go, Attempt). Picking "2. go" lights up Redpoint too, because a
second-go send is a finer-grained redpoint.

### Step 5b, "Strength & finger" (indoor climbing, or a strength/finger session)

Two minute fields at the top carve the other sport's time out of the session:
"Time on strength" and "Time on finger training", each with the hint "Counted
as X. The rest of the session stays Y time."

Then a two-tab toggle: **🏋 Strength** | **🤏 Finger**.

*Strength panel*: repeating exercise cards, each with a select (Pull-ups,
Push-ups, Flies, Superman, Squats, Deadlift, Shoulder press) and three
columns: Sets, Reps, Weight.

*Finger panel*:

- **Campus**: three buttons, None / Campus board / Spray wall.
- **Two-finger / pocket work**: a toggle row with a 🤞 emoji. It exists
  because nothing else in the log reveals it, and pocket work carries pulley
  and lumbrical risk out of proportion to how hard it feels.
- **Hangboard**: repeating exercise cards. Each has **Hands** (Two hands /
  One hand), **Grip** (select of the five grips), **Reps**, **Sets**, and
  **Rest between reps** (seconds, shown only when reps > 1). Then one row per
  set: `Set N`, load in **kg**, hang time in **s**, edge in **mm**.

  Changing the Sets count grows or shrinks the list, seeding new sets from the
  first. Editing set 1 propagates to any set that still matches the old set-1
  value, so it acts as "the default for all sets" without overwriting ones you
  customised. Max 30 sets.

  The hint below spells out the convention with the user's own bodyweight
  substituted in: "Load is total kilos, your bodyweight included. Hanging at
  bodyweight with 10 kg on the harness is 82 kg; hanging with 10 kg taken off
  by a pulley is 62 kg." If any set in the session is a legacy added-weight
  row, a second hint says how many and whether they can be read.

### Step 6, "Notes & photo"

Free text plus one optional photo.

---

## 6. The Coach screen

`/coach`, three pill tabs: **Today**, **The plan**, **Tests**.

### Today

1. **Set-up prompt** if the profile is incomplete: "Tell the coach about you.
   Until it knows what you climb, how often you train and what you have access
   to, it can only give you generic advice. Takes a minute."
2. **Check-in prompt** if today's wellness is not logged: a primary button,
   "How are you today? Check in →".
3. **"Something to work around"**, only when there is an active problem. One
   `SignalBlock` per problem: `⚠️ Fingers` or `⚠️ half-crimp test: stopped by
   pain`, state `47/100 · substantial`, tone amber or red.
4. **The 🧭 Today card**: session emoji and label as the headline, the
   session's goal underneath, then reason chips (short phrases like "Fingers
   recovered · 27d", "Readiness 58", "Monotony high, so vary the stimulus").
   Then a spec grid: Intensity (`Tier 5 · Hard`), Grades, Effort, Volume,
   Rest, Target RPE. Then a "Log this session" primary button that opens the
   wizard prefilled.
5. **"What to do"**: the chosen session as a full `ExerciseCard` with a `pick`
   tag, and the alternatives as one-line `AlternativeRow`s with a `Swap`
   button. Tapping an alternative promotes it for the rest of the day; tapping
   the top one hands the choice back to the coach. Only the choice is spelled
   out in full, because three full cards was most of the page.
6. **"Where you're at"**: four `SignalBlock`s, each tappable through to its
   history: 🤏 Finger tissue, 🔋 Readiness (with a row of per-signal z-score
   chips underneath), 📈 Load trend, 🔁 Monotony. Plus ⚖️ Side-to-side when
   the test battery has found an asymmetry.

### The plan

1. **Goal**: the goal with its emoji, discipline, style, date and days away;
   then a Phase block with the phase's note; then **the blocks to the date** as
   a timeline of consecutive blocks with dates, the current one marked `NOW`;
   then an explanation of where deloads land. Without a goal: "No goal yet.
   Add a competition or a trip and the plan stops being a loop and starts
   counting down to it."
2. **Your week**: a header line (`Power phase · 3 sessions a week`), then the
   next 7 days as a list. Each row is a weekday label, an emoji, a session
   name, and a state: `TODAY`, `NEXT`, a checkmark when logged, or `Rest`.
   Training days expand on tap to show that day's spec and the library
   sessions that fit. A divider row appears mid-list when the block changes
   ("Deload week from here"). Second sessions show as a sub-row tagged
   `2nd · 6 h later`.
3. **The cycle** (only without a dated goal): the repeating four-week
   timeline.
4. **How the plan is built**: a Level signal block; the under-18 note when it
   applies; a Periodisation choice (Undulating / Linear) with the model's
   description; links to "About you & goals" and "📚 Exercise library".
5. **How much to trust this**: three short paragraphs. What is well
   established, what is a chosen number, that there is deliberately no
   injury-risk percentage, and the medical disclaimer.

### Tests

See section 9.

---

## 7. The engine

Everything below is pure arithmetic, recomputed on every render from the rows
fetched at page load. One module assembles the inputs
(`loadCoachInputs`) so every screen reads the same signals; the dashboard card
and the Coach page cannot disagree.

Three rules the whole engine obeys:

1. **Every ratio compares disjoint windows.** Comparing a window against one
   that contains it is self-correlation.
2. **Every derived signal is gated until its baseline is real.** "Not enough
   data yet" beats a confident number computed from noise.
3. **Absence of information is not information of absence.** No profile means
   no filtering, not "answered no to everything". No finger history means
   `unknown`, not `fresh`.

### 7.1 Finger load: the denominator problem

All finger intensity is a percentage of **total** load, bodyweight included,
never of added weight. This is not a detail. Bodyweight is the dominant term,
so a percentage of *added* weight is close to 100% of actual tissue load. For
a 60 kg climber whose max 10 s hang is 65 kg total (that is, +5 kg added):

- "85% of max" read as added weight → +4.25 kg → 64.25 kg → **98.8% of max**
- "85% of max" read as total load → 55.3 kg → **5 kg assisted**

Two completely different sessions from the same instruction, and the error is
largest for exactly the climbers least able to absorb it: anyone whose added
weight is a small fraction of bodyweight.

Consequence for the UI: **negative added weight is normal**, not an error. It
means assisted, via pulley, band, or feet on the floor. Clamping it to
bodyweight or hiding it is a large part of why naive finger libraries end up
prescribing near-maximal work every session. The prescription renders as, for
example, `80–90% · 66–74 kg total (2 kg assisted → +6 kg added)`.

Resolving a max, newest first: an exact-grip two-hand `total_load` test, then
any two-hand test, then a one-hand pair combined as
`(right + left) × 0.93` (`BILATERAL_FACTOR`, a chosen coefficient), then the
legacy `hang_max_kg` plus a bodyweight. With no bodyweight the app **refuses**
to prescribe from a legacy number rather than using the wrong denominator.

A test goes **stale at 16 weeks** and warns at **8 weeks**. Stale means kilos
are not quoted at all; the card falls back to describing the effort.

The `min_edge` protocol (smallest edge holdable ~10 s at bodyweight) exists
because it needs no bodyweight figure at all.

### 7.2 Finger dose

The old model asked "was this a max finger session?", which threw away dose
entirely: one token limit attempt scored the same as forty near-limit
attempts. The current model computes a continuous dose in arbitrary units,
then buckets it into a tier that decides how long the tissue needs.

| Tier | Recovery |
|---|---|
| Maximal | 3 days |
| Hard | 2 days |
| Light | 1 day |
| None | 0 |

**Per hangboard set**, relative intensity `rel = set total kg / max total kg`,
clamped to 0..1.3. Then:

```
dose += 6.06 × rel⁴ × √(hang_seconds × reps)
```

**Fitted, not chosen.** The previous form was `rel³ × seconds × reps × 0.5`, and
it did not do what it was changed to do. The exponent had been raised from 2 to
3 to stop a long repeater session outscoring a max-hang session, but dose was
linear in time under tension, and repeaters carry 245 s against max hangs' 40 s.
No exponent on `rel` can overcome a factor of 6 in a term it multiplies, because
raising it shrinks both sides: the ratio moved from 3.05 to 2.15 and repeaters
still cost twice a max hang. The volume term has to saturate.

With √TUT and the intensity exponent at 4, `k = 6.06` reproduces the library's
own hand-assigned `expectedDose` values, which makes that column a labelled
dataset and the library its own regression test:

| Session | Computed | `expectedDose` |
|---|---|---|
| F1 max hangs, 4 × 1 × 10 s at 85% | 40.0 | 40 |
| F6 grip variety, 4 × 1 × 10 s at 82.5% | 35.5 | 35 |
| F2 repeaters, 5 × 7 × 7 s at 60% | 27.5 | 32 |
| F2 at 70% instead of 60% | 50.9 | correctly higher |
| An 8-set long repeater block | 44.0 | correctly higher |

Default hang time when unlogged is 7 s.

Tier from a set: one-hand → maximal. Otherwise `rel ≥ 0.80` → maximal,
`≥ 0.55` → hard, else light.

With no usable max (or an unreadable set), intensity falls back to edge size
as a coarse proxy: edge ≤ 10 mm → 0.80, ≤ 13 mm → 0.65, else 0.60 if any
weight was added, 0.45 if not. This is a deliberate fallback, not a guess at
the max: treating "any added weight at all" as maximal is wrong, because +2 kg
on 20 mm is not. The numbers are biased low on purpose, because the errors are
not symmetric: underestimating a max costs a slightly easy session,
overestimating one costs a pulley.

**Other contributors:**

| Source | Dose | Tier floor |
|---|---|---|
| Campus board | +25 | maximal |
| Spray wall | +15 | hard |
| Two-finger / pockets | +12 | hard |
| Route at your limit | +4 per attempt | (see below) |
| Route 1 grade below | +2.5 per attempt | |
| Route 2 grades below | +1.2 per attempt | |
| Anything further below | +0.3 per attempt | |

3 or more attempts within 1 grade of your limit → maximal. 1 or 2 → hard.

Indoor sessions have no route log, so an optional **"attempts within a grade of
your limit"** field on indoor climbing feeds the same counter at 2.5 per
attempt. Without it the whole attempt mechanism could never fire indoors, and a
mostly-indoor climber's difficulty was invisible except through finger RPE.

**Named library sessions** act as a floor, never an addition, so they cannot
double-count the itemised dose. A `fingerCost: high` session floors the dose
at 20 and the tier at hard, or at 30 and maximal if it is a youth-restricted
one (max hangs, campus). A `medium` session floors at 8 and light. When a
session names several library entries, they take the **max, not the sum**: the
hardest thing in the afternoon is what the fingers have to recover from, and
summing would count one afternoon as three days of loading.

**Self-reported finger RPE** is also a floor, treated as an alternative
estimate of the same thing:

```
dose = max(dose, 10.3 × (rpe_finger / 10)⁴ × √minutes)
```

Same functional form as the set arithmetic, for the same reason: the old floor
was linear in duration, which gave an ordinary 90-minute session at finger RPE 6
a dose of 24, over the hard threshold. Raising the RPE tier trigger did nothing
while that stood, because the floor promoted the session anyway one rule later.
`k = 10.3` is set by the requirement that a max-hang session described only by
its RPE (9 over 35 min) scores what the same session scores itemised:

| Logged as | Dose | Tier |
|---|---|---|
| finger RPE 6, 90 min | 12.7 | light (an ordinary indoor session) |
| finger RPE 7, 90 min | 23.5 | hard |
| finger RPE 8, 120 min | 46.2 | maximal |
| finger RPE 9, 35 min | 40.0 | maximal (an F1, logged untimed) |

`rpe_finger ≥ 8` → maximal, **`≥ 7` → hard**, `≥ 3` → light. Duration is clamped
to 180 minutes.

The hard cut is 7, not 6, because the UI anchors 6 as "small holds, working
hard", which is an ordinary indoor session for anyone climbing 6C and up.
Scoring that identically to a max hang put a normal three-times-a-week climber
permanently over the 28-day ceiling, and a coach that nags every day is a coach
you learn to ignore.

Hard bouldering counts as maximal only when the fingers were the limiting
factor: `rpe ≥ 8` **and** `rpe_finger ≥ 7`, kept in step with the cut above.
Whole-body RPE alone would let a two-hour pumpy jug circuit block finger work
for three days.

Any climbing or finger session is at least light contact (dose floor 4).

Finally, dose can raise a tier the triggers missed: **≥ 40 → maximal,
≥ 15 → hard**. A logged F1 lands on 40 exactly. Climbing attempts do not reach
these numbers on their own and get their tier from the categorical triggers
instead, which is a safety net rather than the main mechanism.

### 7.3 Finger recovery

Collagen turns over across days: net loss over roughly the first 24-36 h, net
synthesis at about 36-72 h. Pump is metabolic, clears in hours, and is
deliberately not consulted here.

States, from days since the last hard-or-maximal session and that session's
required days:

| State | Condition | Tone |
|---|---|---|
| Not known yet | nothing ever logged | ok |
| Fresh | nothing hard recently, or ≥ required + 14 days | good |
| Loaded today | 0 days | warn |
| Recovering | fewer days than required | warn |
| Recovered | at or past required | good |

**Hours where the session said when it was.** An optional Morning / Midday /
Evening field maps to 09:00 / 13:00 / 19:00, which is enough to tell a Monday
evening to a Wednesday morning (34 h) from two calendar days, and the copy then
says "loaded 34 h ago, needs 48". Untimed rows still fall back to calendar days,
which is all they can support.

Four separate chronic checks, because each sees something the others cannot:

1. **Ramp**: hard finger days in the last 7 days against the 28 days *before*
   that (disjoint). Flags when this week has ≥ 2 and more than 1.5x the
   recent weekly average.
2. **Absolute ceiling** over 28 days, scaled by years under load. Two hard
   finger days every week forever never trips a ramp flag, because the
   baseline is equally high.

   | Tissue level | Elevated (0.8 × high) | High | Very high |
   |---|---|---|---|
   | new (< 2 yrs) | 8 | 10 | 13 |
   | intermediate (2-4) | 10 | 12 | 15 |
   | advanced (5-9) | 11 | 14 | 17 |
   | elite (10+) | 13 | 16 | 19 |

   "High" escalates to "very high" when the 56-day count is also at least
   twice the high threshold.

   Raised from 8/11..12/15, and an "elevated" band added below "high" so the
   count degrades instead of cliff-edging from fine straight to stop. At the old
   numbers, combined with the old finger-RPE trigger, an ordinary climber
   training three times a week sat permanently at "very high" and was told to do
   technique drills indefinitely. Two genuinely hard finger days a week (8-9 per
   28) must read as normal; three a week is where a warning belongs.

   The hard rule also has a fast exit now: a very-high count with **no hard
   finger days in the current week** eases the session by a tier instead of
   replacing it, because the athlete has already done the thing the rule would
   have asked for. Without that, the 28-day window only cleared after weeks of
   reduced climbing and the rule simply repeated itself daily.
3. **Sustained weeks**: the unbroken run of weeks (up to 26) with ≥ 2 hard
   finger days. Two a week is a defensible rate; twenty weeks of it without a
   lighter week is not, and no relative measure can see it.
4. **Peak relative intensity** is carried alongside cumulative dose, because
   they are different mechanisms: pulleys fail on a single peak, tendinopathy
   accumulates under tension over time.

### 7.4 Whole-body load, trend, monotony

Session load, one number per session:

```
load = imported TSS, if present
     = (minutes / 60) × (rpe / 10)² × 100, otherwise
```

Fitness/fatigue/form are the standard exponentially-weighted pair over that
series: **CTL 42 days, ATL 7 days, form = CTL − ATL**. The app computes them
from its *own* unified load series, which includes climbing, because
intervals.icu's TSB only knows what was pushed to it and can read "fresh"
straight through a heavy climbing block.

**Load trend** is this week's mean daily load against the mean of the 28 days
before it. Both windows disjoint. Gated until the baseline is real: chronic
mean ≥ 15 and ≥ 8 active days in the baseline window.

| Ratio | Label | Tone |
|---|---|---|
| ≥ 1.5 | Well above your normal | warn |
| ≥ 1.3 | Above your normal | ok |
| ≥ 0.8 | Steady | good |
| below | Below your normal | ok |

It is deliberately **not** called an acute:chronic workload ratio and there is
no "danger zone", because that framework has not held up. The UI says so.

**Monotony** is the mean load across the days you **trained**, divided by how
much those sessions differ. Flags above **4**, gated below **5 training days** a
week. Strain is `weekly load × monotony`. The series caps at 8 and renders a
zero-spread week at the cap rather than as a gap, because "off the scale" is the
finding, not missing data.

**This is deliberately not Foster's monotony, and the app says so.** Foster
divides by the spread of all seven days with rest days as zeros, which makes the
signal structurally incapable of firing for anyone who rests: a three-session
week lands near 0.87 and a four-session week near 1.15, against a threshold of 2.
The signal read "steady" forever no matter what the athlete did, which teaches
people to stop looking at that part of the screen. Using training days only
measures whether your sessions differ from each other rather than whether you
train every day. The threshold moved with the denominator: over training days, a
week with real hard/easy contrast sits around 2 to 3.5 and only near-identical
sessions pass 4. Below five training days it now says "not meaningful at your
training frequency" instead of printing a number.

### 7.5 Readiness

One number, 0-100, where **50 is your own normal**. Not a comparison with
anyone else.

Inputs and weights:

| Signal | Weight | Inverted | Source |
|---|---|---|---|
| Sleep | 0.125 | no | daily check-in |
| Fatigue | 0.125 | yes | daily check-in |
| Soreness | 0.125 | yes | daily check-in |
| Stress | 0.125 | yes | daily check-in |
| HRV | 0.20 | no | intervals.icu |
| Resting HR | 0.10 | yes | intervals.icu |
| Form | 0.20 | no | the app's own load series |

The subjective half is 0.5 of the total. Missing signals are dropped and the
remainder reweighted, so a user with no intervals.icu still gets a score; the
UI says when it is running on objective data only, and vice versa.

Each signal becomes a z-score of the **last 7 days against a 60-day baseline
that excludes them**. Two things this has to get right:

- The windows must be disjoint.
- The yardstick must be like-for-like. The recent value is a 7-day mean, so
  the spread it is judged against is the spread of **7-day rolling means**, not
  of single days. A weekly average varies far less than one day does, and using
  the daily SD inflates every z-score several-fold.

z is clamped to ±3, guarding against a degenerate baseline (a run of
near-identical weeks) turning a normal week into a z of 12.

```
index = clamp(50 + 10 × weighted mean z, 0, 100)
```

**10 points per SD, not 15**: on ordinal 1-5 items a single bad day moves a
z-score a long way, and tighter scaling produced constant false "Low".

| Index | Label |
|---|---|
| < 38 | Low (warn) |
| < 46 | Below normal |
| 46-58 | Normal |
| > 58 | High |

Gates: at least **21 days of history**, at least **2 wellness entries in the
last 7 days** for the subjective items to count at all, at least 8 points and
a 14-point baseline per signal. Between 2 and 3 entries it counts but is called
**thin**, persistently. The gate used to be a hard 4, which flickered: a user who
checks in on training days only sits at 3 or 4 and crosses it at random, so the
subjective half switched in and out and the index jumped for reasons invisible to
them. A permanent "running on thin subjective data" is more honest than an
intermittent one.

**The absolute check.** Every input is z-scored against its own 60-day baseline,
so a climber who has slept badly and been stressed for two months has a baseline
of "bad", scores z near 0, and reads Normal. The score is definitionally
incapable of seeing a sustained poor state, which is the state most worth seeing.
So alongside the index: any wellness item at the bad end of its own scale for
**10 or more of the last 14 days** surfaces as its own note, independent of the
number. Sleep is scored the other way up (5 is slept well), so "bad" is not the
same end for every item. Copy: "Your sleep has been poor 11 of the last 14 days.
Readiness compares you against your own recent normal, and your recent normal has
been low." This is the same relative-plus-absolute pairing the finger model
already uses.

Wellness is a **separate daily table, not a field on a session**, and this is
the whole point. A rating attached to a session only exists on days you
trained, and people skip sessions when they feel wrecked. The days a readiness
score most needs to see are precisely the days with no data. Only today's row
is editable; backfilling a week of remembered moods is exactly the data this
table must not contain.

### 7.6 Experience level

Two different questions, answered from two different inputs, because
collapsing them makes the plan either patronising or reckless:

- **What you can do now** comes from your grade. Prescribing technique drills
  to an 8B climber wastes the week.
- **What your tendons tolerate** comes from years under load. Collagen
  turnover and tendon stiffening happen over years and do not care what grade
  you climb. A three-year 8A climber has strong fingers and young connective
  tissue, and the chronic ceiling follows the tissue.

| Level | Boulder | Route | Years |
|---|---|---|---|
| Elite | 8A+ and up | 8a+ and up | 10+ |
| Advanced | 7B+ to 8A | 7b+ to 8a | 5-9 |
| Intermediate | 6C to 7B | 6c to 7b | 2-4 |
| Building a base | below | below | under 2 |

Grade wins for the plan's pitch (your hardest discipline counts); years alone
set the tissue ceiling. Unknown on both sides gives a middle-of-the-road plan
rather than a guess.

"Hard" (advanced or elite) changes three things: technique-and-mileage filler
is swapped for real work (`technique → volume`, `aerobic → powerEndurance`),
a real finger session is inserted in any week that lacks one instead of a
maintenance one, and the chronic ceiling is higher.

### 7.7 Grades

Your limit per context is the max of your stated grade and anything you have
logged in the last **120 days**, and indoor, outdoor and board are kept
**separate**, never inferred from each other, because "8B" means different
things on a Moonboard, on plastic and on rock. Each library session declares
which context it is graded in, and the prescription names it ("6C+–7A on the
Kilter").

Each session type declares a grade offset range from your limit:

| Session type | Offset |
|---|---|
| Limit / performance | −1 to 0 |
| Competition simulation | −2 to 0 |
| Power | −3 to −1 |
| Power-endurance | −5 to −3 |
| Volume / capacity | −6 to −4 |
| Technique | −6 to −4 |
| Easy movement (deload) | −6 to −4 |
| Aerobic / ARC | −8 to −6 |

A soft tier reduction shifts the offsets down too, or the card would say
"easier" while quoting limit-grade problems. When both ends clamp to the
bottom of the scale the app renders words instead of a grade: for a 6A climber
"8 grades below your limit" is not a grade, so it says "well below your
limit".

### 7.8 Session types

The vocabulary the plan is written in. `effort` is a subjective description,
not a percentage of anything measured; the grade offsets are the prescribable
currency.

| Key | Label | Emoji | Volume | Rest | RPE | Finger cost |
|---|---|---|---|---|---|---|
| `limit` | Limit / performance | 🎯 | 4-8 hard problems, few attempts each | 3-5 min | 8-10 | high |
| `compSim` | Competition simulation | 🏆 | 4-5 unseen problems, or 1-2 unseen routes | equal to time on the wall | 8-10 | high |
| `fingerStrength` | Finger strength | 🤏 | 3-5 hangs per grip, 5-10 s | 3-5 min | 7-9 local | high |
| `fingerMaintenance` | Finger maintenance | 🪝 | 6 × 10 s no-hangs, or a light repeater set | 50 s | 4-6 local | low |
| `power` | Power | ⚡ | 6-12 problems | 2-4 min | 7-9 | high |
| `powerEndurance` | Power-endurance | 🔥 | linked moves, circuits | ~1:1 work to rest | 7-9 | medium |
| `volume` | Volume / capacity | 🧱 | many problems or laps | short | 5-7 | medium |
| `aerobic` | Aerobic / ARC | 🫁 | continuous 20-40 min | minimal | 3-5 | low |
| `technique` | Technique | 🎨 | focused drills | as needed | 3-6 | low |
| `antagonist` | Antagonist & prehab | 🧰 | 2-3 sets each | as needed | 4-6 | none |
| `mobility` | Mobility & rehab | 🧘 | stretching and easy movement | - | ≤3 | none |
| `mental` | Mental training | 🧠 | 5-20 min | - | - | none |
| `deload` | Easy movement | 🌱 | short, ~30-40 min on the wall, plus mobility | as needed | ≤4 | low |

`mental` exists precisely because it costs nothing physically: it is the only
real content available on a day when everything that touches a hold is
contraindicated.

Each type resolves onto a **(category, tier) grid cell**. The grid is what
makes "tired fingers" mean *one tier down* rather than a different session
entirely. Categories: `hardBoulder`, `hardRope`, `pump`, `volumeBoulder`,
`volumeRope`, `lowIntBoulder`, `fingerStrength`, `strength`, `mobility`,
`mental`, `warmup`. Tiers: 1 Easy, 2 Easy+, 3 Medium, 4 Medium+, 5 Hard.

### 7.9 Periodisation

**Two models**, chosen by the user, with the UI stating plainly that no
climbing study shows one beating another, so pick whichever you will stick to.

*Undulating*: vary the stimulus within the week. The week table by training
days, for a base-building climber:

| Days | Week |
|---|---|
| 2 | limit, volume |
| 3 | limit, powerEndurance, volume |
| 4 | limit, powerEndurance, volume, power |
| 5 | limit, powerEndurance, technique, power, volume |
| 6 | limit, powerEndurance, technique, power, volume, aerobic |

For an experienced climber the filler changes, not the count:

| Days | Week |
|---|---|
| 2 | limit, fingerStrength |
| 3 | limit, fingerStrength, powerEndurance |
| 4 | limit, fingerStrength, power, powerEndurance |
| 5 | + volume |
| 6 | + technique |

*Linear*: a repeating four-week block cycle. Capacity (volume / technique) →
Strength (fingerStrength / volume) → Power (limit / powerEndurance) → Deload.

**With a dated goal**, the cycle is replaced by a countdown. Phase by weeks
remaining:

| Phase | From | Hard / easy (boulder) | Hard / easy (rope) |
|---|---|---|---|
| Base | 12+ weeks | volume / technique | volume / aerobic |
| Strength | 8-11 | fingerStrength / volume | fingerStrength / powerEndurance |
| Power | 4-7 | power / powerEndurance | powerEndurance / volume |
| Peak | 2-3 | limit / technique | limit / powerEndurance |
| Taper | 0-1 | limit / technique | limit / powerEndurance |

A `comp` style overrides parts of Power and Peak with `compSim`, because a
competition is close to a different sport from outdoor climbing: unseen
climbing on a clock, read fast, commit first go, and modern setting is as much
coordination and volumes as it is fingers. Peaking for one does not peak you
for the other.

A `both` discipline (combined Boulder & Lead is a real format) alternates
discipline in two-session blocks while hard/easy alternates every session, so
each discipline gets a hard day and an easy one rather than bouldering taking
all the hard days.

**Taper** is half the volume at the same intensity, not a fortnight of
technique drills. It keeps the Peak session types and applies a
`durationMultiplier` of **0.5**. Copy: "Same sessions, half the time. Nothing
you do now makes you fitter; plenty can make you tired."

**Deload** is a reduction, not a week off. It keeps the phase's own quality
session at about half its usual volume (multiplier **0.6**), keeps roughly
**60% of the training days** (clamped 2-4), gives the rest back as rest, and
drops all doubles. Reduced volume with unchanged intensity is the version with
actual support behind it: intensity preserves the adaptation, volume generates
the fatigue you are shedding. A week of stretching is a week of detraining.

Deloads land at 4-week boundaries counting back from the goal date, never
inside the peak or taper. They are also **earned**: a goal set when it was
already close has no fatigue behind it, so a deload only appears if it falls
at least 3 weeks after the goal was created. Dropping a recovery week into a
five-week run-up costs a fifth of the whole preparation.

Frequency: 2 to 8 sessions a week, at most **6 training days**. Anything above
6 becomes a **double**, always one of antagonist / mobility / finger
maintenance, always at least ~6 hours after the first session. No doubles in a
deload or taper week.

The week is laid out on **real dates**. Stated training weekdays win;
otherwise sessions spread evenly. Hard sessions go on the best-spaced slots
rather than first. Today's slot shows the live suggestion (which reacts to
recovery and check-ins) rather than the raw template, and says when it was
swapped. A logged session ticks its day off. The plan also flags when your
stated training days put two hard finger days back to back.

Finger strength otherwise disappears for months: Base can run 12+ weeks with
no finger stimulus at all, and it vanishes again through Power and Peak. So
any week with none gets one inserted, maintenance for a base-builder, a real
one for an experienced climber, never in a taper week.

### 7.10 The daily decision

In order. The first hard rule that matches wins, and it **changes the session
category**:

| # | Condition | Becomes | Headline |
|---|---|---|---|
| 0 | Under 18 and this session category already used twice in 7 days | technique | (variety note) |
| 1 | A substantial OSTRC problem this week | mobility | Back off, something is brewing |
| 2 | An open injury in the log | mobility | Rehab or easy day |
| 3 | No finger history and the plan wants a costly session | fingerMaintenance | Start easy |
| 4 | Inside the rebuild window and the plan wants a high-cost finger day | rotating low-finger type | Spare the fingers |
| 5 | 8+ straight weeks of hard finger days | fingerMaintenance | Time for an easy finger week |
| 6 | Very high 28-day finger count | technique | Too many hard finger days |
| 7 | Readiness < 38 | deload | Recovery day |
| 8 | Deload week | (unchanged) | Deload week |

Rule 2 gives mobility, not antagonist work, on purpose: antagonist work is
largely shoulder and push, which is the worst possible answer to a shoulder
injury.

Rule 4's rotation is technique → mental → aerobic → antagonist.

If no hard rule fires, **soft rules** apply instead. They keep the same session
and reduce its tier, and they stack (floor 1). This is the single change that
stops the plan contradicting itself: a power-endurance day on tired fingers
becomes *easier power-endurance*, not volume bouldering.

| Condition | Tier drop |
|---|---|
| Inside the rebuild window, any finger cost | −2 |
| Ramp flag (more hard finger days than your normal) | −1 |
| High 28-day finger count | −1 |
| Load trend "well above normal" | −1 |

High monotony adds a reason chip ("vary the stimulus") but never changes the
session.

### 7.11 Choosing the actual exercises

From the grid cell, in order:

1. All library entries in that `(category, tier)` cell, nearest tier first;
   fall back to the type's curated ID list.
2. Filter by **facilities**: `hangboard`, `campus`, `spraywall`, `gym` from
   the profile; `rope` from the discipline focus, so a rope goal makes rope
   sessions relevant even for a boulderer. **With no profile saved, nothing is
   filtered**: not having been asked is not the same as having answered no.
3. Cap at the requested tier (+1), but never to nothing. Everything in
   `hardBoulder` is tier 4-5, because a hard-moves session is hard by
   definition, so when the cap empties the list it falls back to the gentlest
   thing the category has.
4. Filter by `minYearsClimbing`, at any age. Tendon adaptation is measured in
   years.
5. Under 18: drop `youth: 'blocked'` entries (campus, one-arm work). Keep
   `allowed_reduced` ones but cap them (see below).
6. Route around injured regions: drop anything that loads the affected
   structure, but keep exercises that are rehab *for* it.
7. Prefer the goal's discipline.
8. Sort so tier fit beats rotation, with rotation as the tie-break. Take 3.

**Under-18 handling** deserves its own note, because the app deliberately
departs from what a naive reading of youth guidance would give. The Norwegian
Climbing Federation's current position is that *controlled* finger training
loads the fingers less than finger-heavy bouldering does, and it no longer
advises against dead-hangs for growing climbers. What it does still advise
against is campus training and a one-sided focus. So the app does not block
finger strength or limit sessions (an earlier version did, and it refused a
competition junior essentially their whole programme mid-championship
build-up). Instead: campus and feet-off dynamic board work are removed, hangs
are capped at **80% instead of 90%** and given one fewer set, and no session
category may appear more than **twice in a rolling 7 days**. Ages 18-20 get a
note rather than a restriction, because 18 is a chronological proxy for
skeletal maturity and late maturers exist. The copy adds that any finger pain
should be assessed by qualified health personnel.

---

## 8. The exercise library

61 entries, IDs stable forever (a logged session references one). `F` finger,
`K` rope (Norwegian *klatring*), `B` boulder, `C` competition, `S` strength,
`T` stretch, `M` mental, `W`/`WU` warm-up and self-set.

Every entry carries: `id`, `name`, optional Norwegian `name_no`, `category`,
`sessionCat`, `tier` 1-5, `intensity` (anchor + range), `volume`,
`durationTarget_min`, `rpeTarget` (body + finger), `pump` range,
`gradeContext`, `needs`, `loads`, `rehabFor`, `contraindicated`,
`minYearsClimbing`, `youth`, `warmup`, `expectedDose`, and prose for `how`,
`margin`, `progression`, `regression`, `termination`.

`expectedDose` is what the session is *expected* to cost in the same units the
dose model computes after the fact, so the plan can respect its own ceilings at
prescription time instead of generating a week its guards then trim.

| ID | Name | Cat | Grid cell | Tier | Finger cost | Needs | Min yrs | Youth | Dose | Min |
|---|---|---|---|---|---|---|---|---|---|---|
| F1 | Max hangs | finger | fingerStrength | 5 | high | hangboard | 2 | reduced | 40 | 35 |
| F2 | Repeaters | finger | fingerStrength | 4 | high | hangboard | 2 | reduced | 32 | 40 |
| F3 | Campus | finger | fingerStrength | 5 | high | campus | 4 | blocked | 45 | 25 |
| F4 | Sub-max no-hangs | finger | fingerStrength | 1 | low | hangboard | 0 | ok | 8 | 10 |
| F5 | Finger warm-up | warmup | warmup | 1 | low | hangboard | 0 | ok | 5 | 12 |
| F6 | Grip variety hangs | finger | fingerStrength | 4 | high | hangboard | 2 | reduced | 35 | 30 |
| F7 | Pinch block | finger | fingerStrength | 3 | medium | hangboard | 1 | ok | 18 | 20 |
| K1 | Projecting / attempts | rope | hardRope | 5 | high | rope | 1 | ok | 55 | 120 |
| K2 | 10 min on, 10 min off | rope | volumeRope | 2 | medium | rope | 0 | ok | 18 | 90 |
| K3 | Hard–Easy | rope | pump | 3 | medium | rope | 0 | ok | 30 | 90 |
| K4 | Hard–Hard | rope | pump | 4 | high | rope | 0 | ok | 42 | 90 |
| K5 | Up–Down–Up | rope | pump | 4 | high | rope | 0 | ok | 38 | 75 |
| K6 | 3 in a row | rope | pump | 3 | medium | rope | 0 | ok | 30 | 75 |
| K7 | Normal lead climbing | rope | volumeRope | 3 | medium | rope | 0 | ok | 26 | 120 |
| K8 | Fall practice | mental | mental | 1 | low | rope | 0 | ok | 5 | 45 |
| C3 | Comp simulation: lead | rope | hardRope | 5 | medium | rope | 0 | ok | 40 | 90 |
| B1 | Circuit: short | boulder | pump | 4 | medium | spraywall | 0 | ok | 34 | 75 |
| B2 | Circuit: long | boulder | pump | 3 | medium | spraywall | 0 | ok | 28 | 75 |
| B3 | 4×4 | boulder | pump | 4 | high | - | 0 | ok | 40 | 60 |
| B4 | 10×3 | boulder | volumeBoulder | 3 | medium | - | 0 | ok | 32 | 75 |
| B5 | Max bouldering on the training wall | boulder | hardBoulder | 5 | high | spraywall | 2 | ok | 55 | 60 |
| B6 | Easy bouldering | boulder | lowIntBoulder | 2 | low | - | 0 | ok | 14 | 60 |
| B7 | Technique bouldering | boulder | lowIntBoulder | 1 | low | - | 0 | ok | 8 | 60 |
| B8 | Boulder projecting | boulder | hardBoulder | 5 | high | - | 1 | ok | 50 | 60 |
| B9 | Normal bouldering | boulder | volumeBoulder | 3 | medium | - | 0 | ok | 28 | 90 |
| B10 | Campus bouldering | boulder | hardBoulder | 5 | high | spraywall | 4 | blocked | 45 | 25 |
| B11 | Climb 50 boulders | boulder | volumeBoulder | 2 | medium | - | 0 | ok | 20 | 90 |
| B12 | Coordination bouldering | boulder | lowIntBoulder | 2 | low | - | 0 | ok | 10 | 60 |
| B13 | Slab & footwork | boulder | lowIntBoulder | 1 | low | - | 0 | ok | 6 | 50 |
| B14 | Mantles & pressing | boulder | lowIntBoulder | 2 | low | - | 0 | ok | 12 | 50 |
| C1 | Comp simulation: boulder qualification | boulder | hardBoulder | 5 | high | - | 1 | ok | 48 | 90 |
| C2 | Flash session | boulder | hardBoulder | 4 | medium | - | 0 | ok | 30 | 75 |
| C4 | Comp simulation: boulder final | boulder | hardBoulder | 5 | high | - | 1 | ok | 50 | 90 |
| C5 | Single-burn practice | boulder | hardBoulder | 5 | high | - | 0 | ok | 35 | 60 |
| C6 | Long-rest practice | boulder | hardBoulder | 4 | high | - | 0 | ok | 38 | 150 |
| W1 | Set your own boulders | boulder | lowIntBoulder | 1 | low | spraywall | 0 | ok | 10 | 90 |
| S1 | Weighted pull-ups | strength | strength | 4 | low | gym | 1 | ok | 6 | 60 |
| S2 | Lock-off | strength | strength | 3 | low | gym | 0 | ok | 5 | 60 |
| S3 | One-arm pull on rings | strength | strength | 5 | low | gym | 4 | blocked | 8 | 60 |
| S4 | Row | strength | strength | 3 | none | gym | 0 | ok | 3 | 60 |
| S5 | Kettlebell shoulder press | strength | strength | 3 | none | gym | 0 | ok | 2 | 60 |
| S6 | Flies in slings | strength | strength | 3 | none | gym | 0 | ok | 2 | 60 |
| S7 | Squats | strength | strength | 3 | none | gym | 0 | ok | 1 | 60 |
| S8 | Deadlift | strength | strength | 4 | none | gym | 0 | ok | 1 | 60 |
| S8b | Toes to bar | strength | strength | 3 | none | gym | 0 | ok | 2 | 60 |
| S9 | Toes to sky | strength | strength | 3 | none | gym | 0 | ok | 1 | 60 |
| S10 | Superman in slings | strength | strength | 3 | none | gym | 0 | ok | 2 | 60 |
| S11 | Worm in slings | strength | strength | 3 | none | gym | 0 | ok | 2 | 60 |
| S12 | Shoulder external rotations | strength | strength | 1 | none | gym | 0 | ok | 0 | 60 |
| S13 | Circuit | strength | strength | 3 | none | gym | 0 | ok | 3 | 60 |
| S14 | Pyramid | strength | strength | 3 | none | gym | 0 | ok | 3 | 60 |
| S15 | Wrist extensor & flexor eccentrics | strength | strength | 1 | none | gym | 0 | ok | 0 | 60 |
| T1-T5 | Butterfly, Frog, Splits, Hamstring, Back | mobility | mobility | 1 | none | - | 0 | ok | 0 | 20 |
| M1 | Visualisation | mental | mental | 1 | none | - | 0 | ok | 0 | 15 |
| M2 | Competition-day routine | mental | mental | 1 | none | - | 0 | ok | 0 | 20 |
| M3 | Process goals before a session | mental | mental | 1 | none | - | 0 | ok | 0 | 5 |
| M4 | Wind-down / mindfulness | mental | mental | 1 | none | - | 0 | ok | 0 | 15 |

### The prescribed finger sessions, in numbers

| ID | Load | Work | Reps | Sets | Rest | Edge | Grip |
|---|---|---|---|---|---|---|---|
| F1 Max hangs | 80-90% of max total | 10 s | 1 | 4 | 6 min | 20 mm | half-crimp |
| F2 Repeaters | 55-65% of max total | 7 s on / 3 off | 7 (6-10) | 5 | 3 min | 20 mm | half-crimp |
| F3 Campus | bodyweight, feet off | 2 ladders | | 5-6 | 3-4 min | medium-large rungs | |
| F4 Sub-max no-hangs | ~70-80% of a hard pull | 10 s on / 50 off | 6 | 1-2 | ≥ 6 h between sets | 20 mm+ | |
| F6 Grip variety | 80-85% of that grip's max | 10 s | 1 | 4 | 5 min | 20 mm | rotating |
| F7 Pinch block | 80-85% of pinch max | 10 s | 1 per hand | 4 | 3 min | | pinch |

F1's margin rule, shown as a `Margin:` line on the card: "Every hang must end
with 2-3 seconds still in reserve. A set taken to failure means the load was
too high, so drop 5% for the rest of the session."

F4 is the maintenance session and the one most likely to be misread as
optional. It is prescribed at a load that "should never feel hard", most days,
twice a day if the two are ≥ 6 h apart.

### Warm-up protocols

Prerequisites, not sessions. Any library entry marked `finger warm-up
required` means the full protocol before loading anything hard.

- **WU1 General**: 5-10 minutes of easy movement.
- **WU2 Full finger**: 5 min general movement, 10 easy pulls on jugs, then
  5 × 10 s hangs ascending 40% → 50% → 60% → 70% → 75% of max total load,
  60-90 s between. Mandatory before any maximal finger loading.
- **WU3 Shoulder & elbow**: band external rotations, scapular pull-ups, easy
  presses, 2 sets each, light.

### The session menu

A second view of the same knowledge: a 5-tier × 6-category grid of what to do
at each intensity for each kind of session, rendered one column at a time so
it reads on a phone. Columns: Pump, Rope volume, Hard moves rope, Hard moves
bouldering, Low-intensity bouldering, Bouldering volume.

---

## 9. The test battery

`/coach/tests`. Framed as: a test is only worth anything next to the last one,
so run it the way the instructions describe and change nothing between rounds.
Every few months is plenty, because testing is a hard session in itself and
belongs on a fresh day.

**Every test carries both a `how` and a `why`**, and the UI shows them on tap.
The `how` exists because a test performed slightly differently each time
measures nothing. The wording is the app's own, close to the Norwegian
Climbing Federation's descriptions.

Four groups: 🤏 Fingers, 💪 Strength, ⚡ Power, 🧘 Mobility. 18 tests:

| ID | Test | Unit | Group | Per side | Normalised |
|---|---|---|---|---|---|
| `half_crimp` | Half-crimp max | kg | finger | yes | |
| `open_3` | Three-finger open max | kg | finger | yes | |
| `pinch` | Pinch | kg | finger | yes | |
| `max_hang` | Max hang (total load) | kg | finger | | |
| `hang_time` | Hang time at bodyweight | s | finger | | |
| `weighted_pullup` | Weighted pull-up (1RM) | kg | strength | | |
| `lock_off` | Lock-off hold | s | strength | yes | |
| `front_lever` | Front lever | s | strength | | |
| `l_sit` | L-sit | s | strength | | |
| `toes_to_bar` | Toes to bar | reps | strength | yes | |
| `pushups` | Push-ups | reps | strength | | |
| `sargent` | Sargent jump | cm | power | | height |
| `standing_long_jump` | Standing long jump | cm | power | | height |
| `split_to_wall` | Split to wall | cm | mobility | | height |
| `hamstring` | Hamstring reach | cm | mobility | | height |
| `shoulder_mobility` | Shoulder mobility | cm | mobility | yes | |
| `high_step` | High step | cm | mobility | yes | height |
| `single_leg_squat` | Single-leg squat | reps | mobility | yes | |

`max_hang` is the one the coach prescribes from: everything written as "80-90%
of max" means 80-90% of that number.

Bilateral tests store **L and R as separate rows**, because collapsing them
throws away precisely the comparison worth having. Height-dependent tests
store a `normalised` value alongside the raw one, since a raw centimetre value
on a limb-length dependent test is not comparable across a growth spurt.

**A test stopped because of pain is an event, not a missing value.** The
schema has an `aborted_reason` (`pain` / `skin` / `other`) and the field's hint
says it "must never be left blank". A pain-abort in the last 14 days enters the
coach's problem list as a substantial problem with severity 25, which flips the
whole suggestion to "back off" and shows as `⚠️ half-crimp test: stopped by
pain`.

**A testing session saves as a session in the diary too**, and is named F1
(Max hangs) when the sitting included a maximal finger test, because that is
what it physically was. A testing day is training, and the recovery window has
to see it.

**Asymmetry**: any side-to-side gap over **10%** surfaces as a
⚖️ Side-to-side signal, worst first. The threshold is chosen, not clinical,
and the copy says so: "This is a training observation, not a diagnosis; a
persistent gap alongside pain is a reason to see a qualified clinician." The
coach favours one-arm variants while a gap persists.

The finger-test form (separate from the battery, feeding the prescription
maths) takes: protocol (Max total load / Minimum edge), grip, edge mm, hands,
value (+ left value for one-hand), date, notes, aborted reason. The label
switches between "Total load" (hint: "Bodyweight included") and "Smallest
edge".

---

## 10. Check-in

`/checkin`, two tabs: **Today** and **Week**.

**Today** is four `Scale` rows, 1-5:

| Item | Low | High | Inverted |
|---|---|---|---|
| Sleep | Terrible | Great | no |
| Fatigue | Fresh | Exhausted | yes |
| Soreness | None | Very sore | yes |
| Stress | Calm | Very stressed | yes |

Hints: "How well you slept last night", "How tired you feel overall", "Muscle
soreness, separate from tiredness", "Life stress, not training stress".

The framing: "Ten seconds, every day, including rest days. That's the point:
if this only got filled in on training days it would only ever see you on the
days you felt good enough to train. Only today is editable, because
backfilling from memory is exactly the data this must not contain."

There is also a compact bottom-sheet version of this that appears on the
dashboard.

**Week** is the OSTRC Overuse Injury Questionnaire, per body area (Fingers,
Elbow, Shoulder, Wrist, Knee, Back, Other). Four questions, using the
instrument's own response options, summing to a 0-100 severity:

| Q | Question | Options (score) |
|---|---|---|
| 1 | Difficulties participating in normal training and competition? | 0 full / 8 full but with problems / 17 reduced / 25 cannot |
| 2 | Reduced training volume? | 0 none / 6 minor / 13 moderate / 25 major |
| 3 | Affected performance? | 0 none / 6 minor / 13 moderate / 25 cannot participate |
| 4 | Pain? | 0 none / 6 mild / 13 moderate / 25 severe |

A problem is **substantial** when Q1 ≥ 17 or Q2 ≥ 13 or Q3 ≥ 13. That is the
instrument's own definition, not the app's. Anything above zero is worth
seeing. `activeProblems` reads this week's and last week's rows, preferring the
current week per area, worst first.

This is what lets the coach react to a problem that is *developing* rather
than one already declared as an injury, which is the whole reason a validated
questionnaire is in here at all.

---

## 11. Stats and charts

`/stats`, per-sport pill tabs. The **Climbing** tab:

- Tiles: Sessions, Hours, Outdoor, Indoor.
- Coach signals block (the four `SignalBlock`s plus a finger-dose bar chart),
  when the coach is on.
- Fitness/fatigue/form chart, when climbing carries load.
- Climbing hours, split indoor vs outdoor, per period.
- By discipline: horizontal bars for Bouldering / Sport / Trad.
- Indoor vs outdoor bars.
- Feeling trend line.
- **Grade pyramid** (outdoor routes), horizontal bars low to high.
- **Send rate** (outdoor routes): Onsight, Flash, Redpoint, 2. go, Attempt.

The **Finger** tab: tiles for Sessions, Campus, Best hang; sessions per period
bars; and a hangboard progression line.

The **Signals** pages (`/coach/signals/:key`) are the "why" behind each
headline number. Each has the signal block at the top, a chart, a "Why it says
X" spec list, and a plain-language explanation of the mechanism. The finger one
shows a 28-day dose bar chart coloured by tier (red maximal, orange hard,
green light) and rows for last hard session, how hard it was, hard days in 7
and 28, and weeks in a row with 2+ hard days.

Dashboard widgets are user-chosen from a catalogue; the climbing-relevant ones
are "Climbing · month" (sessions + hours) and "Finger · month" (sessions).

---

## 12. Degradation and edge cases

Worth knowing before redesigning anything, because a lot of the UI exists to
handle these:

- **The coach tables may not exist.** Migrations are ordered files in
  `supabase/migrations/`, applied with `npx supabase db push` (see
  `supabase/README.md`). Every read still degrades to empty and the setup screen
  still says how to apply them, because a half-migrated install must not lose
  data. There is also a separate "your tables are from an earlier version"
  state for a missing column.
- **intervals.icu is optional.** Absent credentials is a normal state, never
  an error. Readiness drops HRV, resting HR and runs on what is left, and says
  so.
- **No profile** means no filtering, not "no facilities".
- **No finger test** means the prescription describes the effort instead of
  quoting kilos. A **stale** test (16+ weeks) does the same and says why. A
  test that needs a bodyweight to be read says that instead.
- **Offline** shows a banner: "Offline. Showing your training as of the last
  time you had a connection." Writes queue and flush on reconnect.
- **Gated signals** show "Building baseline" / "No baseline yet" / "Quiet
  week" with the number of days still needed, never a number computed from
  noise.

---

## 13. Fact-check list

Grouped by how much weight the app itself puts on each claim. If you are
checking facts, this is the list.

### 13.1 Claims the app treats as reasonably established

- Finger connective tissue rebuilds across days, not hours: net loss over
  roughly the first 24-36 h, net synthesis at about 36-72 h. The 48 h (hard)
  and 72 h (maximal) windows come from this.
- Pump is metabolic and clears in hours; it is a different axis from
  pulley/tendon load. Hence two separate ratings.
- Tendon and collagen adaptation is measured in years, not seasons, which is
  why the chronic ceiling follows years climbed rather than grade.
- Previous injury is one of the few injury risk factors that holds up
  consistently. The app stays more conservative when injury history is filled
  in.
- Planned recovery (a deload) is among the better-supported parts of any
  training cycle.
- A taper is volume down roughly 40-60% with intensity and frequency
  maintained. The app implements 50% duration at unchanged intensity.
- Foster's monotony (mean daily load / SD) above about 2 for weeks on end is
  the pattern associated with overtraining symptoms. The app no longer computes
  Foster's version, and says so where it shows the number: see 7.4.
- The acute:chronic workload ratio "danger zone" framework has **not** held
  up, which is why the app refuses to use the name or draw the zones.
- Individual-level injury prediction is not achievable, which is why there is
  no risk number.
- The OSTRC-O questionnaire is a validated instrument (Oslo Sports Trauma
  Research Centre), and its scoring and "substantial" definition are used
  as published.
- Half-crimp and open-hand maxima commonly differ by around 20%, which is why
  grip is recorded per set and per test.
- The Norwegian Climbing Federation no longer advises against controlled
  dead-hangs for growing climbers, on the reasoning that a controlled hang
  loads the fingers less than finger-heavy bouldering does; it does still
  advise against campus training and a one-sided focus. **This one is dated and
  unverified**: it is a live position that can move and it decides what a junior
  is prescribed, so it is recorded with its status in
  [docs/youth-guidance.md](youth-guidance.md) and needs checking against the
  federation's current published wording.
- Climbing has a documented problem with disordered eating and RED-S. Hence no
  weight history and no weight chart.

### 13.2 Chosen numbers, not findings

Every one of these is a starting point that the app admits to. If you are
fact-checking, these are the places where evidence is thin and the value was
picked to make the model behave:

**Fitted, not chosen** (a stronger position, and the only two in the engine that
can claim it). Both were refit against the library's own `expectedDose` column,
which makes the library the regression test:

| Constant | Value | Fitted to |
|---|---|---|
| Per-set dose | `6.06 × rel⁴ × √TUT` | F1 → 40, F6 → 35.5, F2 → 27.5 |
| Finger-RPE dose | `10.3 × (rf/10)⁴ × √minutes` | an untimed F1 (rf 9, 35 min) → 40 |

Refit both if either changes, and check the library still reproduces.

Everything below is chosen:

| Constant | Value | Where |
|---|---|---|
| Maximal / hard dose thresholds | 40 / 15 | tier bucketing |
| Campus / spray / pockets dose | 25 / 15 / 12 | absolute additions |
| Near-limit attempt weights | 4 / 2.5 / 1.2 / 0.3 | by grade gap |
| Indoor near-limit attempt weight | 2.5 | the optional indoor field |
| Named-session dose floors | 30 / 20 / 8 | maximal / hard / medium |
| Set tier cutoffs | 0.80 / 0.55 | maximal / hard |
| Finger-RPE tier cutoffs | 8 / 7 / 3 | maximal / hard / light |
| Edge-size intensity proxy | 0.80 ≤10 mm, 0.65 ≤13 mm, 0.60, 0.45 | fallback only, biased low |
| Recovery days per tier | 3 / 2 / 1 | maximal / hard / light |
| Time-of-day hours | 09:00 / 13:00 / 19:00 | morning / midday / evening |
| "Fresh again" | required + 14 days | recovery state |
| Ramp flag | ≥2 hard days and >1.5× baseline | acute vs chronic |
| Chronic ceilings | 10/13, 12/15, 14/17, 16/19 | by years climbed |
| Chronic "elevated" band | 0.8 × high | a band instead of a cliff |
| Sustained-weeks trigger | 8 weeks | forces an easy finger week |
| Readiness scale | 10 points per SD | was 15, produced false "Low" |
| Readiness thresholds | 38 / 46 / 58 | Low / Below / High |
| Readiness weights | 0.125 ×4, 0.2 HRV, 0.1 RHR, 0.2 form | see the note below |
| Sustained poor state | bad end on 10 of 14 days | the absolute check |
| Baseline gates | 21 days history, 2 of last 7 check-ins (thin under 4), 60-day baseline | |
| z clamp | ±3 | degenerate-baseline guard |
| Load trend bands | 1.5 / 1.3 / 0.8 | |
| Load trend gates | chronic ≥15, ≥8 active days | |
| Monotony flag | > 4 | over training days, not Foster's 2 over seven |
| Monotony gate | 5 training days | below that it says so |
| Adherence window | 4 complete weeks | before a weekday counts as skipped |
| Session load formula | `(min/60) × (rpe/10)² × 100` | a TSS analogue, not Foster |
| CTL / ATL | 42 / 7 days | standard, but the load input is ours |
| Bilateral factor | 0.93 | one-hand pair to two-hand max |
| Test staleness | 8 warn / 16 stale weeks | |
| Asymmetry threshold | 10% | |
| Grade lookback | 120 days | |
| Grade offsets per session type | see 7.7 | |
| Deload day fraction | 0.6 | clamped 2-4 days |
| Deload / taper duration | 0.6 / 0.5 | |
| Deload earned-after | 3 weeks since goal created | |
| Goal phase boundaries | 12 / 8 / 4 / 2 / 0 weeks | |
| Youth category cap | 2 per rolling 7 days | |
| Youth hang cap | 80% and one fewer set | |
| Double-session gap | ~6 hours | |
| Level grade thresholds | 6C / 7B+ / 8A+ boulder; 6c / 7b+ / 8a+ route | |
| Level year thresholds | 2 / 5 / 10 | |
| `expectedDose` per exercise | 0-55 | hand-assigned per entry |

**Form is partly double-counted in readiness.** Form (CTL − ATL) carries weight
0.20 and is derived from RPE, which also drives the subjective fatigue item at
0.125. Not fatal, but the effective weight on "how hard have I been training" is
higher than the table implies, and the table is not the place to hide that.

Also worth a second opinion: every `how` and `why` string in the test battery
and the exercise library. They are the app's own wording of protocols, and a
protocol described slightly wrong is a number that means nothing. Note that
several gym lifts (S4, S6-S11) carry no `how` at all: they are named movements
with sets and reps rather than protocols, and the card omits the paragraph
rather than rendering an empty one.

### 13.3 Bugs that were found by writing this document

All fixed. Kept here because the pattern matters more than the individual bugs:
every one of them was found by writing prose about the app, not by running it,
which is an expensive way to find bugs and does not repeat. That is why there are
now golden fixtures (`src/lib/coachFixtures.test.js`), property tests, and a bench
at `/coach/simulator`.

1. **The Stats "Best hang" tile and hangboard chart read the wrong field.**
   `hangboardSeries` took `Math.max(...sets.map(s => s.weight))`, but v4 sets
   store `load_total_kg` and leave `weight` empty, so every session logged after
   the total-load migration charted as 0 kg. The card also still said "kg added".
   Now reads resolved total load through the normaliser, is titled "Hangboard,
   heaviest two-hand set / kg total", and shows unreadable legacy sets as a gap
   with an explanation rather than a zero.
2. **"Grades worked" fed nothing.** Now feeds `currentLimit` per context, so an
   indoor limit can come from what you actually climbed. The dose hole it left is
   closed by the optional indoor "attempts within a grade of your limit" field
   (see 7.2), because the attempt mechanism could otherwise never fire indoors.
3. **`gradeContext: 'spray'` never resolved.** Handled through the board context
   with its own label.
4. **`campusCount` counted spray-wall sessions as campus.** `campus` is an enum
   whose `'spray'` member is also truthy. Campus and spray are now counted
   separately, and every read of that field goes through the normaliser.
5. **Calendar-day recovery.** Now hours when the session recorded a time of day
   (see 7.3), calendar days otherwise.
6. Still true, and deliberate: `S8b` breaks the numeric ID convention. It was
   inserted after `S8` shipped, and IDs are never renumbered because logged
   sessions reference them.
7. The three bugs above numbered 1, 3 and 4 were the same bug: several consumers
   independently interpreting an untyped JSON blob and drifting apart. That is
   what `src/lib/sessionShape.js` now exists to prevent.

### 13.4 Deliberate omissions, so nobody "fixes" them

- No V-scale or YDS. French and Fontainebleau only.
- No bodyweight history, no weight chart, ever. See 4.
- No injury-risk percentage or risk zone.
- Speed climbing is not modelled.
- **No cross-athlete comparison of finger strength, hang load or grade. Ever.**
  This is the same decision as the missing weight chart, and team mode is the
  door it would come back through: a roster sorted by max hang, among teenagers,
  in a sport with a documented RED-S problem. The squad screen shows state (who
  has a problem, who is under-recovered, who has not answered) and sorts by
  problem severity, never by anything resembling performance. If you are about to
  add a sortable strength column to a roster, this line is why you should not.
- **A coach never sees raw wellness entries or free text.** Signal sharing is a
  separate, per-coach, revocable grant that carries derived numbers and OSTRC
  only. An athlete who knows their coach reads the stress field stops filling in
  the stress field, and then readiness stops working for the athletes it matters
  most for.
- **No feedback loop from "did the session go well" into plan content.** At one
  athlete you cannot learn what worked, so `coach.followed` is read for dose and
  for the diary, not for adapting the plan.
- **Adherence is not that, and is allowed.** Noticing what *happens* needs no
  science: if a training weekday has had nothing logged on it for four complete
  weeks, hard sessions move off it. That is the difference between a plan you
  follow and a plan you feel guilty about, and it is deliberately separated from
  the omission above so the useful half is not excluded by the reasoning for the
  other half.
- No social or leaderboard features on any coach data. Every coach table is
  private to its owner; the only cross-user reads are the two explicit,
  athlete-granted, select-only policies in the squad migration.

---

## 14. If you are redesigning the UI

The parts that carry real information and should survive any redesign:

1. **Tier and the reason chips.** "Same session, easier, because fingers were
   loaded 1d ago" is the single most useful thing the app says. A redesign that
   shows the session but not why it changed loses the product.
2. **The tone colour.** Users read the left border before they read anything.
3. **Kilos, not percentages.** "80-90%" is not actionable. "80-90% · 66-74 kg
   total (2 kg assisted)" is. Keep the resolved number and keep the assisted
   case visible.
4. **Gated states as first-class content.** "Building baseline, needs about 21
   days" is a real state with real copy, not an empty placeholder.
5. **The tap-through to history.** Every headline number is one tap from its
   own chart and its own inputs. A number the user cannot interrogate is a
   number they cannot calibrate trust in.
6. **The disclaimers.** "Pain is your real signal" appears on every coach
   surface, and the beta tag appears wherever the coach is named. Neither is
   decoration.
