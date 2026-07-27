# Training Coach: full specification (v3)

A feature in a personal climbing/training diary (React PWA + Supabase, single
user plus a handful of friends). **Every rule below is deterministic**: no
model, no learning, no inference. Arithmetic over logged data plus lookup
tables. There is no server component: all of this runs client-side in the
browser from rows fetched out of Supabase.

**Document lineage.** v2 incorporated an external review; its fixes are marked
**[R]** with the issue they fixed, so a reviewer can check the fix rather than
re-derive the bug. v3 additions and changes are marked **[v3]**. Where a v3
change replaced a v2 behaviour, both are stated; the old behaviour is usually
the more obvious design, and why it was wrong is the useful part.

**What a reviewer is most usefully sceptical about:** §4.1 dose constants, §7
the experience model (newest and least tested), §9.3 the deload rules (changed
twice), §6 the z-score construction, and §17's honesty about what is evidence
versus what is a chosen number. Review questions are in §18.

---

## 0. Design stance

1. **No injury-risk number, ever.** Individual injury prediction is not
   achievable; a percentage implies precision that does not exist. The UI says
   this explicitly rather than silently omitting it.
2. **Every ratio compares disjoint windows.** Scoring a window against one that
   contains it is self-correlation. **[R]** v1 got this right for load and wrong
   for the finger ramp flag and readiness; both are now disjoint.
3. **Every derived signal is gated until its baseline is real.** "Not enough
   data yet" beats a confident number computed from noise. Ungated ratios once
   produced "3513% of baseline".
4. **Absence of information ≠ information of absence.** No profile ⇒ no
   filtering (not "answered no to everything"). No finger history ⇒ `unknown`,
   not `fresh`. **[R]**
5. **Framing is awareness, never prescription of certainty.** The coach reports
   what the logged data says and what it would do; the athlete decides.
6. **[v3] Every headline number must be able to explain itself.** Any signal
   shown as a number is tappable through to its history and its inputs (§12).
   A number the user cannot interrogate is a number they cannot calibrate
   trust in.
7. **[v3] Degrade, never block.** Missing Supabase tables, missing profile,
   missing intervals.icu connection, offline. Each removes capability without
   breaking the page.

---

## 1. Data model (inputs)

All tables are strictly private to their owner via RLS; no friend or coach
policy references any of them. The migration is `supabase/coach.sql`, applied
by hand by the user. Each table is created, indexed and RLS-locked in one
contiguous block, so a failed statement can never leave a table created but
unprotected.

### 1.1 `sessions`: the training log (pre-existing table)
`date`, `sport`, `subtype`, `location` (indoor/outdoor), `rpe` 1–10,
`duration` (minutes), `feeling` 1–5, `extra` jsonb, `routes[]` (`grade`,
`send_type`, `attempts`).

`extra` fields the coach reads:
- `rpe_finger` 1–10, **finger/crimp intensity**, anchored in the UI
  ("8 = failing ON holds, not on moves") **[R: unanchored scales drift]**
- `pump` 1–5, forearm pump (§8.1)
- `finger.hangboard[]`: `{hands, reps, rest, sets:[{weight, time, edge}]}`
- `finger.campus`: `'' | 'board' | 'spray'`
- `finger.pockets`: boolean, two-finger/pocket work **[R]**
- `training_load`: imported TSS (from intervals.icu)
- **[v3]** `coach`: `{followed: 'planned'|'other', type, exercise}` (§13)

**Finger load and pump are separate axes and must stay that way.** Crimping
strains pulleys and tendons (collagen turns over across days); pump is metabolic
and clears in hours. Only finger load feeds recovery. Conflating them was a real
bug: a two-hour pumpy jug circuit would block finger work for three days.

### 1.2 `wellness_days`: one row per calendar day **[R: survivorship bias]**
`sleep`, `fatigue`, `soreness`, `stress` (each 1–5; Hooper index).

v1 read `feeling` off the session row. That is sampled only on days you trained,
and climbers skip sessions when they feel wrecked, so the weeks readiness
should crash were the weeks with fewest and most favourably-selected data, at
0.50 weight. Wellness is now logged independently of training, and the
subjective signals require **≥4 entries in the last 7 days** to count at all.
Soreness is its own item rather than folded into one "feeling" score **[R]**.

**[v3] Only today's row is editable.** Backfilling a week of remembered moods
is precisely the data this table must not contain; the UI enforces it and says
why. See §14.3 for the capture mechanism.

### 1.3 `ostrc_reports`: weekly OSTRC-O **[R: no pain/symptom input]**
The validated 4-item Overuse Injury Questionnaire (Oslo Sports Trauma Research
Centre), per body area, scored with the instrument's own response options
(0/8/17/25 and 0/6/13/25) summing to 0–100 severity. "Substantial" =
Q1 ≥ 17 or Q2 ≥ 13 or Q3 ≥ 13.

This is what lets the coach react to a problem that is *developing* rather than
one already declared as an injury. `activeProblems()` reads this week's and last
week's rows, preferring the current week per area, and returns them worst-first.

### 1.4 `coach_profile`
Grades **per context** (`max_boulder_outdoor|indoor|board` + `board_type`,
`max_route_outdoor|indoor`, `flash_boulder`, `onsight_route`), `sessions_week`,
facility booleans (`has_hangboard|campus|spraywall|gym`), `hang_max_kg` +
`hang_edge_mm` + **`hang_tested_on` [R]**, **`preferred_days` (ISO weekdays)
[R: calendar blindness]**, `injury_history`, `focus`, `birth_year`,
`climbing_since`.

**Grades are per context** because "8B" means different things on a Moonboard,
on plastic, and on rock. Each exercise carries a `gradeContext`; prescriptions
quote the matching one and always name it. These must never be collapsed into
one grade.

### 1.5 `coach_goals`
`title`, `kind`, `target_date`, `discipline` (boulder/rope/both),
`style` (comp/outdoor), `grade`, `achieved`, **`created_at` (used by [v3]
§9.3)**. Speed is **not** modelled.

### 1.6 `injuries`: gains `region` **[R]**
`fingers|elbow|shoulder|wrist|knee|back|other`. Without it the coach cannot
route around the affected structure.

### 1.7 External: intervals.icu
Optional. Supplies daily `hrv`, `restingHR`, and its own ctl/atl. Absence is
normal, not an error; readiness simply runs on the signals available.

---

## 2. End-to-end execution walkthrough

This is the whole mechanism in call order. Everything downstream is pure
functions over the arrays fetched in step 1.

```
1. FETCH (parallel, all failures degrade to empty)
   fetchSessions()        → sessions[]        (newest-first)
   fetchInjuries()        → injuries[]
   fetchIcuFitnessData()  → { wellness }      (may be null)
   fetchCoachProfile()    → profile | null | {missingTable:true}→null
   fetchGoals()           → goals[]
   fetchWellness()        → wellness_days[]   (last 90d, ascending)
   fetchOstrc()           → ostrc_reports[]   (last 12 weeks)

2. coachReadout(sessions, injuries, icuWellness, {model, profile, goals,
                wellness, ostrc})
   │
   ├─ daysPerWeek  = clamp(profile.sessions_week ?? 3, 2, 8)
   ├─ limits       = buildLimits(sessions, profile)          §3
   ├─ level        = experienceLevel(profile)                §7
   ├─ recovery     = fingerRecovery(sessions, limits, profile)  §4
   ├─ trend        = loadTrend(sessions)                     §5.2
   ├─ monotony     = monotonyStrain(sessions)                §5.3
   ├─ readiness    = readiness(sessions, wellness, icuWellness) §6
   ├─ form         = currentForm(sessions)                   §5.1
   ├─ problems     = activeProblems(ostrc)                   §1.3
   └─ suggestion   = suggestSession(sessions, {all of the above})  §11
        ├─ plan   = plannedType(sessions, model, daysPerWeek, goals, level) §9
        ├─ decision tree overrides plan.key → key            §11
        ├─ exercises = pickExercises(key, profile, …)        §8.3
        └─ grades    = gradeRange(key, limits, exercises[0]) §3.2

3. VIEWS (each consumes the readout; none re-derives anything)
   CoachCard        → suggestion + 2 signals            (dashboard)
   Coach page       → everything + rollingPlan(…)   §10 + phaseTimeline(…) §9.4
   CoachSignals     → the *Series functions          §12
   Stats › Climbing → the 4 signals + finger dose bars
```

**Purity boundary.** `src/lib/coach.js` performs no I/O and holds no state. It
is a library of pure functions over `(sessions, profile, goals, wellness,
ostrc, injuries)`. Everything time-dependent reads `new Date()` directly, which
is the one impurity and the reason `readiness()` gained an explicit `asOf`
parameter **[v3]**, see §12.

---

## 3. Grades and limits

### 3.1 Establishing the limit
```
currentLimit(sessions, subtype, statedGrade, location)
  = max( statedGrade,
         max grade in routes[] of matching sessions within 120 days )
  filtered to the same `location` when one is given
```
Indoor and outdoor are never inferred from each other. `buildLimits` returns a
`{boulder, route, ctx:{boulder:{outdoor,indoor,board}, route:{…}}, boardType}`
structure so a prescription can quote the context it actually applies to.

### 3.2 Prescribing a grade
```
gradeAt(limit, offset) = scale[ clamp(limit.idx + offset, 0, len-1) ]
gradeRange(typeKey, limits, exercise):
   context = exercise.gradeContext (outdoor|indoor|board)
   family  = exercise.category === 'rope' ? route : boulder
   limit   = limits.ctx[family][context]  ||  fallback to family limit
   [lo,hi] = SESSION_TYPES[typeKey].grades
```
**[R]** When *both* ends clamp to the floor of the scale the app prints "well
below your limit" rather than a nonsense grade, since "8 grades below your limit" is
not a grade for a 6A climber. Board contexts are named by board type
("on the Kilter", "on the Moonboard").

---

## 4. Finger dose and recovery

### 4.1 Continuous dose **[R: binary flag discarded dose]**
v1 asked "was this maximal?", so one token limit attempt scored the same as forty
near-limit attempts. Now `fingerDose(session, limits, profile)` returns a
continuous `dose`, a `tier`, and `why[]` (human-readable contributors).

```
hangboard   Σ over sets: rel² × time_s × reps × 0.35
            rel = added_kg / hang_max_kg          (when a usable test exists)
                = 0.85 if edge ≤10mm, 0.70 if ≤13mm, 0.60 if added>0, else 0.45
campus      board +25 · spray +15
pockets     +12
climbing    Σ over routes: w × attempts,  w = 4 (at limit) / 2.5 (−1) / 1.2 (−2) / 0.3
[v3] named  dose = max(dose, 30) if the tagged library session is high-cost and
 session      youthRestricted, else max(dose, 20) if high-cost,
              else max(dose, 8) if medium-cost                          (§13)
rpe_finger  dose = max(dose, (rpe_finger/10)² × min(duration,180)/60 × 45)
```

`rpe_finger` and the named session are taken as *alternative estimates of the
same thing* (a floor), never added on top, so they cannot double-count the
itemised dose.

**Absolute tier triggers:** one-arm hang, campus board, `rel ≥ 0.8`,
`rpe_finger ≥ 8`, ≥3 near-limit attempts, or **[v3]** a tagged high-cost
youth-restricted session (max hangs, campus) ⇒ `maximal`.
Dose alone also promotes: ≥40 ⇒ maximal, ≥15 ⇒ hard.
Any climbing or finger session at all is ≥ `light` (dose floor 4).

**[R] `added weight > 0` is gone.** +2 kg on 20 mm is not maximal loading. When
a tested max exists, intensity is relative to it; when it doesn't, the edge is
the proxy and added weight alone can only reach `hard`.

**[R] Hang-test staleness.** `hang_tested_on` > 8 weeks warns; > 16 weeks the
max is no longer used as a reference (`usableHangMax` returns null) and F1 is
prescribed without kilos. A percentage of a number from six months ago is a
number nobody knows.

### 4.2 Required recovery scales with tier **[R]**
| Tier | Recovery |
|---|---|
| maximal | 72 h (3 d) |
| hard | 48 h (2 d) |
| light | 24 h (1 d) |

State = `daysSinceMax` vs that requirement:
`unknown` (nothing ever logged) · `loaded` (0) · `recovering` (< required) ·
`ready` (≥ required) · `fresh` (≥ required + 14).

Only `hard`/`maximal` sessions set `last`; `light` days do not reset the clock.

**Basis:** net collagen loss over ~24–36 h, net synthesis ~36–72 h
(Magnusson/Kjaer). Timing is the supported part; bucket edges are a reading.

**Known limitation:** days are *calendar* days, as the session row stores no time.
Monday 21:00 → Wednesday 07:00 is 34 h but counts as two days. Fixing this is a
schema change.

### 4.3 Chronic exposure: three separate checks
```
ramp        acute   = hard finger days, days 0–6
            chronic = hard finger days, days 7–34        ← disjoint [R]
            flag if acute ≥2 and acute > 1.5 × (chronic/4)
level       days28 ≥ ceiling.veryHigh              ⇒ very-high
            days28 ≥ ceiling.high                  ⇒ high
                                                    (very-high if days56 ≥ 2×high)
sustained   unbroken run of weeks with ≥2 hard finger days   [R]
```

**[v3] The `level` ceilings are no longer constant.** They scale with years
under load (§7):

| Tissue level (years climbing) | high | very-high |
|---|---|---|
| new (<2) | 8 | 11 |
| intermediate (2–5) | 9 | 12 |
| advanced (5–10) | 11 | 14 |
| elite (10+) | 12 | 15 |

v2 pinned these at 9/12 for everyone. That is the beginner's figure, and for a
fourteen-year climber it meant the coach constantly flagged its own
prescriptions: the plan would prescribe three quality finger days and the
guard would immediately swap one out, every week. The guard itself is
unchanged and non-negotiable; only the number of days it means has moved.

**[R] The sustained-run counter exists because the reviewer's exact scenario
defeats everything else**: 2 hard finger days/week for 20 weeks, always 3 days
apart. `daysSinceMax` is always ≥3, the ramp never fires (the baseline is
equally high), and `days28 = 8` sits under any sane rate threshold. Verified:
the run counter reports 20 weeks and the coach prescribes an easy finger week.

---

## 5. Whole-body load

### 5.1 Session load: a TSS-analogue heuristic, **not Foster** **[R]**
```
load = imported_TSS  |  (minutes/60) × (rpe/10)² × 100
```
Foster's session-RPE is *linear* (RPE × minutes). This squares intensity so the
number is commensurable with imported TSS. **Side effect, stated plainly:**
squaring crushes easy sessions (RPE 4 ≈ 16% of RPE 10 per hour), so volume days
build little chronic load, which inflates any ratio measured against it.

Fitness/fatigue/form use the app's own unified series across all sports:
`ctl += (load − ctl)/42`, `atl += (load − atl)/7`, `form = ctl − atl`, seeded
from history before the window so lines don't ramp from zero.

### 5.2 Load trend: this week vs your recent normal
```
acute   = mean(daily load, days 0–6)
chronic = mean(daily load, days 7–34)     ← disjoint
ratio   = acute / chronic
```
**[R] Both sides are arithmetic means.** v1 mixed an EWMA numerator with an
arithmetic denominator and seeded the EWMA from `chronic`: at λ=0.25 the seed
still carried ~13% weight after 7 days, so 13% of "acute" was literally the
chronic value, blunting real spikes.

**Gate [R]:** `chronic ≥ 15 AU/day` and `≥8 active days` in the chronic window.
Display caps at "300%+".

Labels: ≥1.5 well above normal · ≥1.3 above · 0.8–1.3 steady · <0.8 below.

**[R] The name "ACWR" is gone from code and UI.** It is called "load trend" and
described as "this week vs your recent normal". Identical arithmetic, none of
the borrowed authority from a framework whose predictive value has not held up.
The UI states this explicitly.

### 5.3 Monotony & strain (Foster, correctly attributed)
`monotony = mean(7d) / SD(7d)`, `strain = weekly load × monotony`, flag > 2.0.
Gate: ≥3 active days in the last 7. SD = 0 (a perfectly flat week) yields
`monotony: null`, displayed as "Very high" rather than as a division error.

---

## 6. Readiness (0–100, personal baseline)

```
z = (mean(last 7 days) − mean(baseline 7-day rolling means)) / SD(those means)
    baseline = days 8–67        ← disjoint [R]
    clamped to ±3
```

**[R] Two statistical fixes.** (a) The baseline excluded the recent window.
(b) The recent value is a 7-day *mean*, so it is judged against the spread of
7-day means, not of single days; using the daily SD inflates z several-fold.
An intermediate attempt (3-day smoothing) made this *worse*, because smoothing
shrinks SD; it was removed.

Guards inside `signalZ`: ≥8 points total, ≥14 baseline points, ≥4 baseline
rolling means, SD > 0, result clamped to ±3 (a degenerate run of near-identical
weeks must not turn a normal week into z = 12).

| Signal | Weight | Direction | Source |
|---|---|---|---|
| Sleep | 0.125 | higher better | `wellness_days` |
| Fatigue | 0.125 | inverted | `wellness_days` |
| Soreness | 0.125 | inverted | `wellness_days` |
| Stress | 0.125 | inverted | `wellness_days` |
| HRV | 0.20 | higher better | intervals.icu |
| Form / TSB | 0.20 | higher better | app's own series |
| Resting HR | 0.10 | inverted | intervals.icu |

Weights renormalise over available signals. Subjective items need **≥4 entries
in the last 7 days**. When none qualify, `subjectiveMissing` is set and the UI
says the score is running on objective data only, with the reason.

```
index = clamp(50 + 10 × composite, 0, 100)
```
**[R] 10 points/SD, not 15**, with bands <38 Low · <46 Below normal ·
≤58 Normal · >58 High. At 15/SD a composite z of −0.67 tripped "Low", which on
ordinal 1–5 items happens constantly.

**Gate:** ≥21 days of session history **[R: was 14, too thin for a stable SD]**.

**[R] Form is computed from the app's own unified load series**, which includes
climbing. intervals.icu's TSB only knows what is pushed to it and can read
"fresh" straight through a heavy climbing block, at 0.20 weight.

**[v3] `readiness(…, asOf = new Date())`.** All internal windows are relative to
`asOf` and `signalZ` discards points after it, so the function can be replayed
for any past date. This is what makes the readiness history chart honest: each
point is what the score *would have said that day*, not today's score projected
backwards. Cost is O(days) recomputation; at 42 points on a personal dataset
this is negligible.

---

## 7. Experience model **[v3, entirely new]**

The complaint that produced this: an elite climber (8B boulder, climbing since
2012, former national U20 champion) was being prescribed technique drills and
easy mileage, and correctly said the weeks were too easy to drive adaptation.

**The model deliberately answers two different questions from two different
inputs, and never collapses them into one number.**

| Question | Input | Drives |
|---|---|---|
| What can you do now? | **grade** | week composition, filler upgrades, finger-session injection |
| What do your tendons tolerate? | **years climbing** | chronic finger-day ceilings (§4.3) |

Collapsing these is what makes a plan either patronising or reckless, depending
on which input it happens to pick. A three-year 8A climber has strong fingers
and young connective tissue: they should get the hard sessions but keep the
conservative tissue ceiling. A twenty-year 6B climber is the reverse.

```
years      = currentYear − climbing_since
byYears    = ≥10 elite · ≥5 advanced · ≥2 intermediate · else new
byGrade    = max over known contexts, on the harder of boulder/route:
             boulder idx ≥17 (8A+) elite · ≥13 (7B+) advanced · ≥8 (6C) intermediate
             route   idx ≥19 (8a+) elite · ≥15 (7b+) advanced · ≥10 (6c) intermediate
level.key      = byGrade ?? byYears ?? 'intermediate'     ← prescription
level.tissueKey= byYears ?? 'intermediate'                ← tissue ceilings
level.hard     = key ∈ {advanced, elite}
level.known    = either input was available
```

Unknown on both sides yields a middle-of-the-road plan rather than a guess in
either direction, and the UI says so and points at the setup form.

**What `level.hard` changes:**
1. Undulating week table (§10.1): `UNDULATING_WEEK_HARD`.
2. Filler upgrade `HARDER_EASY`: `technique → volume`, `aerobic → powerEndurance`.
   Technique drills and easy mileage build a base you do not yet have; they are
   not what makes an already-strong climber stronger.
3. The no-finger-week injection (§9.5) becomes `fingerStrength` instead of
   `fingerMaintenance`.
4. (Via `tissueKey`, separately) the chronic ceilings in §4.3.

**The level is surfaced in the UI** as its own block on the Coach page, stating
what it decided, what it was derived from, and what it changes. A level the
user cannot see is a level they cannot correct.

---

## 8. Session types and the exercise library

### 8.1 Pump scale
1 No pump · 2 Slight · 3 Moderate · 4 Very pumped · 5 Completely pumped.
(1–3 endurance, 4 endurance/PE, 5 strength/PE.) Deliberately a separate axis
from finger load, see §1.1.

### 8.2 Session types

`effort` is a **subjective description**, not a percentage **[R]**. v1 carried
both a "%max" column and grade offsets, and for an 8A boulderer they
contradicted each other (aerobic at −8 steps ≈ 6C, nowhere near "30–50%").

| Key | Label | Effort | Finger cost | Grade offset |
|---|---|---|---|---|
| `limit` | Limit / performance | At your limit | high | −1…0 |
| `compSim` | Competition simulation | Near your limit | high | −2…0 |
| `fingerStrength` | Finger strength | Maximal, low volume | high | - |
| `fingerMaintenance` | Finger maintenance **[R]** | Easy, never near failure | low | - |
| `power` | Power | Hard, fast, fresh | high | −3…−1 |
| `powerEndurance` | Power-endurance | Sustained and pumpy | medium | −5…−3 |
| `volume` | Volume / capacity | Comfortably hard | medium | −6…−4 |
| `aerobic` | Aerobic / ARC | Easy, continuous | low | −8…−6 |
| `technique` | Technique | Easy on body, hard on brain | low | −6…−4 |
| `antagonist` | Antagonist & prehab | Light | none | - |
| `mobility` | Mobility & rehab **[R]** | Easy | none | - |
| `deload` **[v3 redefined]** | **Easy movement** | Easy throughout | **low** | **−6…−4** |

**[v3] `deload` was "Deload / rest", finger cost `none`, no grades, and its
exercise list was five stretches.** It is now *the easy slot of a deload week*,
not the whole week: easy climbing plus mobility, ~30–40 min. See §9.3 for why.

Offsets are steps on the relevant scale, applied to the limit **for the grade
context of the chosen exercise**, and clamped (§3.2).

### 8.3 Exercise library and selection

~45 named sessions with real protocols, translated from the athlete's own
training plan. Each carries `category`, `fingerCost`, `needs[]` (facilities),
`gradeContext`, `style` (comp/outdoor), `loads[]` (body regions) **[R]**,
`rehabFor[]` **[R]**, `youthRestricted` **[R]**, pump range, protocol fields.

- **Finger:** F1 max deadhang · F2 repeaters · F3 campus · **F4 sub-max no-hangs [R]**
- **Rope:** K1–K7, C3 comp simulation (lead)
- **Boulder:** B1–B11, W1 set-your-own, C1 comp simulation, C2 flash session
- **Strength:** S1–S14, **S15 wrist extensor/flexor eccentrics [R]**
- **Mobility:** T1–T5

**[R] F4 was the missing piece.** The decision tree downgraded to "low-finger"
but nothing in F1–F3 qualified. F4 (10 s on / 50 s off × 6, ~70–80% effort,
≥6 h apart) is simultaneously the cold-start answer, the deload answer and the
tired-fingers answer.

```
pickExercises(typeKey, profile, rotate, discipline, style, {age, injuredRegions})
  candidates by session type (ordered, best-fit first)
    → filter by facilities            (skipped entirely when profile is null)
    → filter out youthRestricted       if age < 18                  [R]
    → filter out anything loading an injured region,
      unless it is rehabFor that region                             [R]
    → prefer matching discipline (boulder/rope), never filter to empty
    → rotate by week index (variety across weeks)
    → stable-sort by style match (comp/outdoor), matching first
    → take 3
  exception: typeKey 'mobility' returns the whole routine, unsliced
```
**[v3]** `deload` no longer takes that exception: it is a real session now and
gets the normal top-3 treatment.

---

## 9. Periodisation

### 9.1 Without a dated goal
Undulating (weekly pattern) or Linear (Capacity → Strength → Power → Deload),
**with no claim either is superior**. The UI says to pick whichever you'll
stick to. The 4:1 rhythm counts from the first logged session
(`cyclePosition`). Undated goals only bias hard-day quality (`goalEmphasis`:
strength → fingerStrength, grade → limit).

### 9.2 With a dated goal
```
weeks = floor(days_until / 7)
≥12 Base · ≥8 Strength · ≥4 Power · ≥2 Peak · <2 Taper
```

| Phase | Boulder | Rope | Comp override |
|---|---|---|---|
| Base | volume / technique | volume / aerobic | - |
| Strength | fingerStrength / volume | fingerStrength / powerEndurance | - |
| Power | power / powerEndurance | powerEndurance / volume | easy → compSim |
| Peak | limit / technique | limit / **powerEndurance [R]** | hard → compSim |
| Taper | technique / deload | technique / deload | - |

**Combined (Boulder & Lead).** `discipline: 'both'` is a real value, not a
missing one. Disciplines alternate in two-session blocks while hard/easy
alternates every session, so each discipline gets a hard day and an easy one
rather than bouldering taking all the hard days.

**Goals are date arithmetic, not AI.** weeks-until → phase lookup. If asked to
make goals "smarter", say what it actually does rather than implying inference.

### 9.3 Deloads **[v3, changed twice, both changes matter]**

**Change A: a deload is a reduction, not a week off.**

v2 filled every training slot of a deload week with the `deload` type, whose
exercise list was five stretches. The result was a whole week of stretching. For
a strong climber that is not recovery, it is a week of detraining and a wasted
week, and the athlete said exactly that.

```
deloadKeys(hardKey, trainingDays):
  days  = clamp(round(trainingDays × 0.6), 2, 4)
  slots = spreadPositions(trainingDays, days)          ← evenly spaced
  slot[0]      = hardKey        ← the phase's own quality session, kept
  slot[last]   = 'mobility'
  slot[middle] = 'deload'       ← easy movement
  all other training slots = null → handed back as rest days
plus: no doubles in a deload week
```
`hardKey` comes from `deloadHardKey`: the phase's hard key with a goal; with
the linear model, **the block that just finished** (`LINEAR_BLOCK[blockWeek−1]`)
rather than the deload block itself; otherwise `limit`.

Days holding a kept session are marked `reduced: true`, and the UI renders the
volume row as "…, at about half, it's a deload" plus an explanation that cutting
volume sheds fatigue while cutting intensity loses the adaptation.

**Note the honest seam:** the app never sees your set count, so "half the
volume" is an *instruction to the athlete*, not arithmetic the app performs.
Only the day count (0.6) is computed. This is called out in the code comment
so nobody later mistakes the copy for a calculation.

**Change B: a deload has to be earned.**

```
isGoalDeloadWeek(goal, weeksOut):
  return false unless weeksOut ≥ 4 and weeksOut % 4 == 0
  return true  if goal.created_at is absent
  deloadDate = target_date − weeksOut×7
  return (deloadDate − created_at) / 7  ≥  3 weeks
```

A deload exists to shed fatigue built by the weeks before it. A goal set when it
was already close has no such weeks behind it: dropping a recovery week into a
five-week run-up costs a fifth of the whole preparation and banks rest that was
never earned. A goal you have been building toward for months has earned it, so
there the 4-week rhythm stands.

Verified both ways on a 35-days-out rope goal: created today → no deload, road
reads Power (2 wks) → Peak → Taper; the same goal backdated six months → deload
returns at 27 Jul–2 Aug.

**[R, still true] The rhythm is anchored to the countdown**, not to the first
logged session, so a deload can never land inside the 2-week Peak or the Taper.

**Consistency requirement:** `goalPhase`, `weekKeys` and `phaseTimeline` all
call `isGoalDeloadWeek`. All three must agree or the UI contradicts itself.

### 9.4 The block timeline **[v3]**
`phaseTimeline(goals, sessions, model)` answers "what stage am I in and what is
coming", which the 7-day window structurally cannot.

- **Goal mode:** walks ISO weeks from the current week to the target date,
  computing each week's phase and deload status with **the same arithmetic the
  weekly plan uses** (`days remaining at today + wk×7`), merging consecutive
  identical labels into blocks, marking `current` / `past`.
- **Cycle mode:** the repeating four weeks with real dates, current week marked.

**A bug worth recording:** the first implementation anchored blocks to the goal
date (`target − weeks×7`), which put block boundaries mid-week; the timeline
said "deload from Sunday" while the plan trained that Sunday. Any countdown
view must walk calendar weeks with the plan's own arithmetic.

### 9.5 Finger-work injection **[R, [v3] level-aware]**
Any non-taper week containing no `fingerStrength` and no `fingerMaintenance`
gets one injected into the first non-high-cost slot. Base can otherwise run 12+
weeks with zero finger stimulus, and it vanishes again through Power and Peak.
**[v3]** For `level.hard` the injected session is `fingerStrength`, not
`fingerMaintenance`: an experienced climber maintaining is an experienced
climber detraining.

---

## 10. Weekly structure and the rolling plan

```
sessions_week ∈ [2,8]   (values outside are clamped; DB allows 1–14) [R: #24]
trainingDays  = min(n, 6)     ← at least one full rest day, always
doubles       = n − trainingDays
```
Doubles land on already-hard days; second sessions are always low finger cost
(antagonist / mobility / finger maintenance) and ≥6 h later. **Two hard sessions
in one day is never generated.**

### 10.1 Week composition (`weekKeys(pos, goal, emphasis, model, trainingDays, wk, level)`)
```
1. resolve the phase for week `wk` (goal mode) or the block (cycle mode)
2. if deload → return deloadKeys(…)                         §9.3, done
3. keys = phase plan | emphasis alternation | linear alternation
        | undulatingWeek(trainingDays, level)
4. [v3] if level.hard: map keys through HARDER_EASY
5. inject finger work if the week has none                   §9.5
6. spread high-finger-cost sessions across the training slots (spreadPositions)
```

| days | `UNDULATING_WEEK` | **[v3]** `UNDULATING_WEEK_HARD` |
|---|---|---|
| 2 | limit, volume | limit, fingerStrength |
| 3 | limit, powerEndurance, volume | limit, fingerStrength, powerEndurance |
| 4 | limit, powerEndurance, volume, power | limit, fingerStrength, power, powerEndurance |
| 5 | limit, powerEndurance, technique, power, volume | limit, fingerStrength, power, powerEndurance, volume |
| 6 | + aerobic | + technique |

### 10.2 The rolling 7-day plan **[v3, replaces `weekPlan`]**

v2 rendered "this week" as an abstract ordered list of N sessions plus M rest
rows, with no dates. It could not show that next week was a different phase, so
a deload week appeared as an unexplained wall of identical rows.

`rollingPlan(sessions, model, sessionsPerWeek, goals, profile, suggestion)`
returns **today plus the next six calendar dates**:

```
for each of the 7 days:
  weekday  = ISO 1..7
  wk       = which plan-week this date falls in (0 = current, 1 = next)
  week     = weekKeys(…, wk, level)          ← memoised per wk
  slotKey  = week.keys[ daySlots.indexOf(weekday) ]   (null ⇒ rest)
  key      = slotKey, except today, where the live `suggestion.key` wins
             (flagged `adjusted` when it differs from the template)
  logged   = sessions already logged on that date
  ⇒ { date, weekday, isToday, rest, key, type, adjusted, discipline, second,
      logged, next, deload, reduced, phaseLabel, blockLabel }
```

- `daySlots` = `preferred_days` when enough are set, otherwise the sessions are
  spread evenly across the week so the plan still lands on real dates. The UI
  says which case it is in.
- `blockLabel` = `'Deload'` when the week is a deload, else `phaseLabel`. The
  divider compares `blockLabel`, **not** `phaseLabel`, so a deload week keeps its
  phase label ("Power"), so comparing labels alone let a deload week appear with
  no divider and no explanation at all. That was the reported bug.
- `next` marks the first unlogged training day.
- `minHardGap` = smallest gap in calendar days between high-finger-cost days
  inside the window; < 2 raises an explicit warning.
- `phaseChange` = the first day whose `blockLabel` differs from day 0's.

**Today's row is the live suggestion, not the template.** That is the visible
point at which check-ins and recovery bend the plan, and it keeps the Today card
and the week view from contradicting each other.

**Known wart:** `restDays` is reported as `7 − trainingDays`, which describes
the standing schedule rather than a deload week (which has more). It is only
used in prose describing the normal week.

---

## 11. Daily decision tree (in order, most limiting wins)

```
0. age < 18 and planned ∈ {fingerStrength, power, limit} → volume
   (plus: youthRestricted exercises filtered out entirely)     [R]
1. substantial OSTRC problem this week      → mobility     caution   [R]
2. open injury (region-aware)               → mobility     caution   [R]
3. finger history unknown and planned costly→ fingerMaintenance      [R]
4. fingers loaded/recovering, cost ≥ medium → low-finger type (rotates)
5. sustained ≥8 weeks of hard finger days   → fingerMaintenance      [R]
6. chronic finger level very-high           → technique              [R]
7. readiness < 38                           → deload
8. [v3] the week is a deload                → keep the planned key,
                                              headline "Deload week",
                                              reason "Half the volume,
                                              same intensity"
9. finger ramp flag and cost high           → powerEndurance
10. chronic finger level high and cost high → powerEndurance         [R]
11. load trend sharp and cost high          → volume
12. otherwise → planned; report actual finger state
    (+ monotony > 2 appends "vary the stimulus")
```

**[v3] Rule 8 changed meaning.** It was `planned == deload → deload`, i.e. the
week's own type. Now the deload week resolves to a real session (§9.3) and rule
8 only relabels it, with tone `moderate` rather than `easy`. Rule 7 (readiness
collapse) still overrides it and still yields the genuinely easy `deload` type,
that ordering is deliberate: a bad-readiness day inside a deload week should be
easy, not merely reduced.

**[R] Rules 1–2 prescribe `mobility`, not `antagonist`.** Antagonist work is
largely shoulder and push, the worst available fallback for a shoulder injury.
Region-aware filtering then removes anything loading the affected structure.

**[R] Rule 0 gates on exercise properties, not just session type**, because
campus work (F3, B10) can surface under several type keys. 18–20 is flagged as a
soft watch band, not a restriction: 18 is a chronological proxy for skeletal
maturity and late maturers can still have open growth plates.

---

## 12. Signal history and explanation **[v3, entirely new]**

Every signal shown as a number is a button opening `/coach/signals/:key` with a
history chart and a "why it says this" breakdown. Series functions apply **the
same gates as the live signals**, emitting `null` (a gap) rather than a zero
when a gate fails, since otherwise the chart would confidently plot exactly the
noise the gates exist to suppress.

| Signal | Series | Window | Explanation shown |
|---|---|---|---|
| Finger tissue | `fingerDoseSeries` | 28 d | daily dose bars coloured by tier; last hard session, its tier and required hours, `why[]` contributors, days7/days28, sustained weeks, ramp and chronic warnings |
| Readiness | `readinessSeries` | 42 d | replayed per day via `asOf` (§6); per-input z-score, weight and direction; explicit note when subjective inputs are missing |
| Load trend | `trendSeries` + `dailyLoadSeries` | 42 d / 28 d | acute mean, chronic mean, ratio; "not an injury-risk zone" stated |
| Monotony | `monotonySeries` | 42 d | this week day-by-day; weekly load, monotony, strain |

`monotonySeries` caps at 4 and reports a flat week (SD = 0) at the cap rather
than as a gap: "off the scale" is the finding, not missing data.

The same four blocks are embedded in **Stats › Climbing** (own stats only, never
an athlete viewed as a coach), so the numbers are reachable where the training
is being reviewed rather than only on the coach page.

---

## 13. Session tagging: the log→coach feedback path **[v3, new]**

When the coach is enabled and the sport is climbing/finger/strength, the logging
wizard gains a step: *"Did you do the planned session?"* → **As planned ·
{today's suggestion}** or **Something else** → pick from the full library.

Stored as `extra.coach = {followed, type, exercise}`. Consumed in two places:

1. **`fingerDose`** takes the named session as a dose/tier floor (§4.1). "This
   was F1 max deadhang" is a direct statement about finger loading that no
   amount of duration-and-RPE inference reconstructs.
2. **`rollingPlan`** ticks the day off with the session's real name
   ("F4 · Sub-max no-hangs ✓") instead of a generic sport label.

For a back-dated session the "as planned" option is meaningless (there is no
past suggestion to compare against), so the step degrades to a single "which
session was it?" picker.

This is the only feedback path from the log back into the coach beyond raw
session fields. **It does not adapt the plan's future content**: nothing here
learns.

---

## 14. UI surfaces

### 14.1 Map
```
Settings → Training coach (localStorage `pref.coach`, off by default)
Dashboard → CoachCard        suggestion, finger tissue, readiness, check-in CTA
/coach                       today + goal + blocks + signals + 7-day plan + level
/coach/setup                 profile & goals (autosaves)
/coach/library               the whole exercise library + session menu
/coach/signals/:key          the four signal histories                    [v3]
/checkin                     Today | This week (OSTRC) | History          [v3]
Stats › Climbing             the four signals + finger dose               [v3]
```

### 14.2 Navigation **[v3 fix]**
Back buttons use `useBack(fallback)`: real `navigate(-1)` when
`window.history.state?.idx > 0`, else a `replace` navigate to the fallback for
deep links and fresh PWA launches. Previously setup/library pushed `/coach` as a
*new* entry, so history grew on every tap and Back bounced between two screens
forever.

### 14.3 Daily check-in capture **[v3]**
A bottom sheet on the Dashboard, once per day, when the coach is on and today
is unlogged. `pref.checkinPromptDay` records that the prompt was *shown*, not
that it was saved, and dismissing must not re-nag an hour later. Unlike the
check-in page (which autosaves per tap) the sheet saves on an explicit button
and closes, because an interruption needs a clear exit. The History tab charts
30 days per Hooper item plus days-logged and streak.

---

## 15. Failure modes and degradation

| Condition | Behaviour |
|---|---|
| `supabase/coach.sql` not run | Every read returns `[]`/`null`; setup page states which file to run; nothing crashes |
| Older `coach.sql` | `hasOldSchema()` detects missing newer columns and says "re-run it, it's safe" |
| No profile | No facility filtering at all (**not** "answered no to everything"); level = middle |
| `{missingTable:true}` | Normalised to `null` before reaching the generator, a real past bug |
| No intervals.icu | HRV/RHR drop out; readiness renormalises over remaining weights |
| Thin history | Signals report "building baseline" with the specific requirement |
| Offline | Sessions queue in the outbox; coach runs on cached rows |

**Schema errors are matched on codes only, never message text.** PostgREST
phrases missing-table (`PGRST205`) and missing-**column** (`PGRST204`) almost
identically; a message regex once told a user who had already run the migration
to run it again. Postgres's own `42P01`/`42703` are checked alongside.

---

## 16. Evidence labelling

**Reasonably supported**
- Collagen turnover *timing* → the ≥48 h rule
- Session-RPE as internal load; forearm/finger-localised RPE tracking climbing
  load better than whole-body
- Subjective wellness ≥ HRV for tracking training response
- Coupled ACWR being statistically unsound → uncoupled windows
- Fingers dominating climbing injury epidemiology; youth growth-plate risk
- OSTRC-O as a validated overuse instrument
- Low external-rotation strength as a shoulder-injury association
- **[v3]** Reduced *volume* with maintained *intensity* as the form of a taper
  or deload that preserves performance, better supported than the scheduling
  of deloads itself (see below)

**Moved out of "supported" [R]**
- **Scheduled deload weeks.** *Adequate recovery* is well supported; *scheduled
  deload weeks* are not, and the evidence points the other way (Coleman/
  Schoenfeld 2024, n=39: a mid-programme deload week negatively affected
  lower-body strength gains with no benefit elsewhere). The 4:1 rhythm is
  labelled convention. **[v3] this is precisely why the deload was rebuilt as a
  reduction rather than a week off, and why it is now skipped when unearned.**
- **The ~6 h refractory window.** Baar's work is *in vitro* engineered ligament.
  Mechanistically reasonable, not established in human tendon. Labelled a
  mechanistic extrapolation, in the spec and on F4's card.
- **Forearm-localised RPE.** v1 cited the evidence but did not implement it.
  It now drives a continuous finger-dose series, so the citation matches the
  behaviour.

**Heuristic / chosen, not derived**
Every numeric threshold: dose constants (40/15), the **[v3]** named-session
floors (30/20/8), readiness weights, 10 pts/SD, trend gates (15 AU/day, 8 active
days), monotony gate, ramp factor 1.5, sustained-run threshold (8 weeks),
tier→recovery mapping, grade offsets, phase boundaries, doubles placement,
`fingerCost` labels, **[v3]** the experience thresholds (years 2/5/10; boulder
6C/7B+/8A+), **[v3]** the chronic ceilings per level, **[v3]** the deload day
fraction (0.6) and the 3-week earned-deload rule.

---

## 17. Known limitations

- Calendar days, not hours, as no session time is stored (schema change)
- Comp formats are modelled as boulder, rope, or combined. Not modelled: comp
  *rounds* (qualification / semi / final have different densities), and speed,
  which is out of scope by design
- No per-grip modelling beyond a pockets flag (no crimp vs pinch vs sloper)
- One board type per athlete
- Squared load term under-weights bouldering and easy volume (§5.1)
- **Nothing adapts from outcomes.** §13 tells the coach what you *did*, never
  whether it went well. There is no feedback loop, by design, but it means a
  plan that is systematically too hard or too easy self-corrects only through
  the recovery guards, not through performance.
- OSTRC severity gates the decision tree but is not trended over time
- **[v3]** The experience model is a lookup on two numbers. It cannot see that
  someone is returning from a year out, or that a stated max is a decade old
- **[v3]** "Half the volume" in a deload is athlete-facing copy, not enforced
  or verified arithmetic (§9.3)
- **[v3]** `UNDULATING_WEEK_HARD` at 5–6 days prescribes three high-finger-cost
  days per week. That is defensible for an elite climber but sits close to the
  chronic ceiling, so the §11 guards will periodically trim it, visible to the
  user as the plan changing its mind
- The plan does not know which *plan slot* a logged session was meant to fill
  when sessions are logged out of order; it matches by date only

---

## 18. Review questions (v3)

Carried forward from v2 and still open:

1. Are the dose constants (maximal ≥40, hard ≥15) and the weightings inside
   `fingerDose` sensible, particularly hangboard `rel² × time × reps × 0.35`
   against `4 × attempts` for a limit-grade climb?
2. Is tier→recovery (72/48/24 h) right, and is 72 h enough for a genuinely
   maximal session in a masters-age athlete?
3. Is the sustained-run threshold (8 unbroken weeks at ≥2 hard finger days) the
   right shape for chronic overload, or should it be dose-based?
4. Is the rolling-means z-score the right yardstick, and are ≥4 wellness entries
   per week plus 21 days of history enough?
5. Is OSTRC "substantial" the right trigger for suppressing training, or should
   any score > 0 already reduce load?
6. Does the comp/outdoor and boulder/rope phase split hold up, especially rope
   Power → power-endurance?

New in v3:

7. **Is splitting experience into grade-driven prescription and years-driven
   tissue tolerance the right decomposition?** Is `climbing_since` a usable
   proxy for years *under load*, given it counts calendar years since starting
   rather than years of structured training?
8. **Are the scaled chronic ceilings (elite 12/15 hard finger days per 28 d)
   defensible**, or does raising a safety threshold on the basis of self-reported
   experience invert the guard's purpose?
9. **Is the earned-deload rule sound?** It uses the goal's `created_at` as a
   proxy for "how long you have been building toward this". A user who has
   trained consistently for months and only *records* the goal late gets no
   deload. Is there a better proxy, e.g. actual logged load in the preceding
   weeks, and is 3 weeks the right threshold?
10. **Is a deload that keeps one full-intensity session at ~half volume, drops
    to ~60% of training days, and removes doubles, an actual deload**, or has
    the reduction been made so mild that it no longer sheds fatigue?
11. **Does `UNDULATING_WEEK_HARD` overshoot?** Three high-finger-cost sessions
    per week for an elite climber, given the guards will trim it, is prescribing
    ambitiously and trimming reactively better or worse than prescribing
    conservatively?
12. **Is replaying readiness through `asOf` legitimate**, given the underlying
    wellness rows may have been entered irregularly? Each point is "what the
    score would have said with the data that now exists for that date", which is
    not identical to what it *did* say.
13. Anything still overstating its evidence base?
