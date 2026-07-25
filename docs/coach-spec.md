# Training Coach — full specification (v2)

A feature in a personal climbing/training diary (React PWA, Supabase).
**Every rule below is deterministic** — no model, no learning, no inference.
Arithmetic over logged data plus lookup tables.

v2 incorporates an external review. Changes from v1 are marked **[R]** with the
issue they fixed, so a reviewer can check the fix rather than re-derive the bug.

---

## 0. Design stance

1. **No injury-risk number, ever.** Individual injury prediction is not
   achievable; a percentage implies precision that does not exist.
2. **Every ratio compares disjoint windows.** Scoring a window against one that
   contains it is self-correlation. **[R]** v1 got this right for load and wrong
   for the finger ramp flag and readiness; both are now disjoint.
3. **Every derived signal is gated until its baseline is real.**
4. **Absence of information ≠ information of absence.** No profile ⇒ no
   filtering. No finger history ⇒ `unknown`, not `fresh`. **[R]**

---

## 1. Data model

### 1.1 Sessions (`sessions`)
`date`, `sport`, `subtype`, `location` (indoor/outdoor), `rpe` 1–10,
`duration`, `extra` jsonb, `routes[]` (`grade`, `send_type`, `attempts`).

`extra` fields the coach reads:
- `rpe_finger` 1–10 — **finger/crimp intensity**, anchored in the UI
  ("8 = failing ON holds, not on moves") **[R: unanchored scales drift]**
- `pump` 1–5 — forearm pump (§5)
- `finger.hangboard[]` — `{hands, reps, sets:[{weight, time, edge}]}`
- `finger.campus` — `''｜board｜spray`
- `finger.pockets` — boolean, two-finger/pocket work **[R]**
- `training_load` — imported TSS

**Finger load and pump are separate axes.** Crimping strains pulleys/tendons
(collagen turns over across days); pump is metabolic and clears in hours.
Only finger load feeds recovery.

### 1.2 `wellness_days` — one row per calendar day **[R: survivorship bias]**
`sleep`, `fatigue`, `soreness`, `stress` (each 1–5; Hooper index).

v1 read `feeling` off the session row. That is sampled only on days you trained,
and climbers skip sessions when they feel wrecked — so the weeks readiness
should crash were the weeks with fewest and most favourably-selected data, at
0.50 weight. Wellness is now logged independently of training, and the
subjective signals require **≥4 entries in the last 7 days** to count at all.
Soreness is its own item rather than folded into one "feeling" score **[R]**.

### 1.3 `ostrc_reports` — weekly OSTRC-O **[R: no pain/symptom input]**
The validated 4-item Overuse Injury Questionnaire (Oslo Sports Trauma Research
Centre), per body area, scored with the instrument's own response options
(0/8/17/25 and 0/6/13/25) summing to 0–100 severity. "Substantial" =
Q1 ≥ 17 or Q2 ≥ 13 or Q3 ≥ 13.

This is what lets the coach react to a problem that is *developing* rather than
one already declared as an injury.

### 1.4 `coach_profile`
Grades **per context** (`max_boulder_outdoor｜indoor｜board` + `board_type`,
`max_route_outdoor｜indoor`, `flash_boulder`, `onsight_route`), `sessions_week`,
facility booleans, `hang_max_kg` + `hang_edge_mm` + **`hang_tested_on` [R]**,
**`preferred_days` (ISO weekdays) [R: calendar blindness]**, `injury_history`,
`focus`, `birth_year`.

### 1.5 `coach_goals`
`title`, `kind`, `target_date`, `discipline` (boulder/rope/both),
`style` (comp/outdoor), `grade`, `achieved`. Speed is **not** modelled.

### 1.6 `injuries` — gains `region` **[R]**
`fingers｜elbow｜shoulder｜wrist｜knee｜back｜other`. Without it the coach cannot
route around the affected structure.

---

## 2. Finger dose and recovery

### 2.1 Continuous dose **[R: binary flag discarded dose]**
v1 asked "was this maximal?" — one token limit attempt scored the same as forty
near-limit attempts. Now `fingerDose(session)` returns a continuous dose **and**
a tier.

```
hangboard   Σ over sets: rel² × time_s × reps × 0.35
            rel = added_kg / hang_max_kg          (when a usable test exists)
                = 0.85 if edge ≤10mm, 0.70 if ≤13mm, 0.60 if added>0, else 0.45
campus      board +25 · spray +15
pockets     +12
climbing    Σ over routes: w × attempts,  w = 4 (at limit) / 2.5 (−1) / 1.2 (−2) / 0.3
rpe_finger  dose = max(dose, (rpe_finger/10)² × min(duration,180)/60 × 45)
```
`rpe_finger` is taken as an *alternative estimate of the same thing*, not added
on top, so it cannot double-count.

**Absolute tier triggers:** one-arm hang, campus board, `rel ≥ 0.8`,
`rpe_finger ≥ 8`, or ≥3 near-limit attempts ⇒ `maximal`.
Dose alone also promotes: ≥40 ⇒ maximal, ≥15 ⇒ hard.

**[R] `added weight > 0` is gone.** +2 kg on 20 mm is not maximal loading. When a
tested max exists, intensity is relative to it; when it doesn't, the edge is the
proxy and added weight alone can only reach `hard`.

**[R] Hang-test staleness.** `hang_tested_on` > 8 weeks warns; > 16 weeks the max
is no longer used as a reference and F1 is prescribed without kilos.

### 2.2 Required recovery scales with tier **[R]**
| Tier | Recovery |
|---|---|
| maximal | 72 h |
| hard | 48 h |
| light | 24 h |

State = `daysSinceLoad` vs that requirement:
`unknown` (nothing ever logged) · `loaded` (0) · `recovering` (< required) ·
`ready` (≥ required) · `fresh` (≥ required + 14).

**Basis:** net collagen loss over ~24–36 h, net synthesis ~36–72 h
(Magnusson/Kjaer). Timing is the supported part; bucket edges are a reading.

**Known limitation:** days are *calendar* days — the session row stores no time.
Monday 21:00 → Wednesday 07:00 is 34 h but counts as two days. Fixing this is a
schema change.

### 2.3 Chronic exposure — three separate checks
```
ramp        acute = hard finger days, days 0–6
            chronic = hard finger days, days 7–34        ← disjoint [R]
            flag if acute ≥2 and acute > 1.5 × (chronic/4)
level       days28 ≥12 ⇒ very-high; ≥9 ⇒ high (very-high if days56 ≥18)
sustained   unbroken run of weeks with ≥2 hard finger days   [R]
```

**[R] The sustained-run counter exists because the reviewer's exact scenario
defeats everything else**: 2 hard finger days/week for 20 weeks, always 3 days
apart. `daysSinceMax` is always ≥3, the ramp never fires (the baseline is
equally high), and `days28 = 8` sits under any sane rate threshold. Verified:
the run counter reports 20 weeks and the coach prescribes an easy finger week.

---

## 3. Whole-body load

### 3.1 Session load — a TSS-analogue heuristic, **not Foster** **[R]**
```
load = imported_TSS  |  (minutes/60) × (rpe/10)² × 100
```
Foster's session-RPE is *linear* (RPE × minutes). This squares intensity so the
number is commensurable with imported TSS. **Side effect, stated plainly:**
squaring crushes easy sessions (RPE 4 ≈ 16% of RPE 10 per hour), so volume days
build little chronic load, which inflates any ratio measured against it.

### 3.2 Load trend — this week vs your recent normal
```
acute   = mean(daily load, days 0–6)
chronic = mean(daily load, days 7–34)     ← disjoint
ratio   = acute / chronic
```
**[R] Both sides are now arithmetic means.** v1 mixed an EWMA numerator with an
arithmetic denominator, and seeded the EWMA from `chronic` — at λ=0.25 the seed
still carried ~13% weight after 7 days, so 13% of "acute" was literally the
chronic value, blunting real spikes. Both problems disappear with plain means,
which is also Lolli's uncoupled-rolling-average recommendation.

**Gate [R]:** `chronic ≥ 15 AU/day` and `≥8 active days` (was 5 / 4 — about 1.4
hours at RPE 10 per month, far too permissive). Display caps at "300%+".

Labels: ≥1.5 well above normal · ≥1.3 above · 0.8–1.3 steady · <0.8 below.

**[R] The name "ACWR" is gone from code and UI.** It is called "load trend" and
described as "this week vs your recent normal". Identical arithmetic, none of
the borrowed authority from a framework whose predictive value has not held up.

### 3.3 Monotony & strain (Foster — correctly attributed)
`monotony = mean(7d) / SD(7d)`, `strain = weekly load × monotony`, flag > 2.0.
Gate: ≥3 active days.

---

## 4. Readiness (0–100, personal baseline)

```
z = (mean(last 7 days) − mean(baseline 7-day rolling means)) / SD(those means)
    baseline = days 8–67        ← disjoint [R]
    clamped to ±3
```

**[R] Two statistical fixes.** (a) The baseline excluded the recent window.
(b) The recent value is a 7-day *mean*, so it is judged against the spread of
7-day means, not of single days — using the daily SD inflates z several-fold.
An intermediate attempt (3-day smoothing) made this *worse*, because smoothing
shrinks SD; it was removed.

| Signal | Weight | Direction |
|---|---|---|
| Sleep | 0.125 | higher better |
| Fatigue | 0.125 | inverted |
| Soreness | 0.125 | inverted |
| Stress | 0.125 | inverted |
| HRV (intervals.icu) | 0.20 | higher better |
| Form / TSB | 0.20 | higher better |
| Resting HR | 0.10 | inverted |

Weights renormalise over available signals. Subjective items need **≥4 entries
in the last 7 days**. When none are available the UI says the score is running
on objective data only.

```
index = clamp(50 + 10 × composite, 0, 100)
```
**[R] 10 points/SD, not 15**, with bands <38 Low · <46 Below · ≤58 Normal ·
>58 High. At 15/SD a composite z of −0.67 tripped "Low", which on ordinal 1–5
items happens constantly.

**Gate:** ≥21 days of history **[R: was 14, too thin for a stable SD]**.

**[R] Form is computed from the app's own unified load series**, which includes
climbing. intervals.icu's TSB only knows what is pushed to it and can read
"fresh" straight through a heavy climbing block, at 0.20 weight.

---

## 5. Pump scale
1 No pump · 2 Slight · 3 Moderate · 4 Very pumped · 5 Completely pumped.
(1–3 endurance, 4 endurance/PE, 5 strength/PE.)

---

## 6. Session types

`effort` is a **subjective description**, not a percentage **[R]** — v1 carried
both a "%max" column and grade offsets, and for an 8A boulderer they
contradicted each other (aerobic at −8 steps ≈ 6C, nowhere near "30–50%").

| Key | Label | Effort | Finger cost | Grade offset |
|---|---|---|---|---|
| `limit` | Limit / performance | At your limit | high | −1…0 |
| `compSim` | Competition simulation | Near your limit | high | −2…0 |
| `fingerStrength` | Finger strength | Maximal, low volume | high | — |
| `fingerMaintenance` | Finger maintenance **[R]** | Easy, never near failure | low | — |
| `power` | Power | Hard, fast, fresh | high | −3…−1 |
| `powerEndurance` | Power-endurance | Sustained and pumpy | medium | −5…−3 |
| `volume` | Volume / capacity | Comfortably hard | medium | −6…−4 |
| `aerobic` | Aerobic / ARC | Easy, continuous | low | −8…−6 |
| `technique` | Technique | Easy on body, hard on brain | low | −6…−4 |
| `antagonist` | Antagonist & prehab | Light | none | — |
| `mobility` | Mobility & rehab **[R]** | Easy | none | — |
| `deload` | Deload / rest | Minimal | none | — |

Offsets are steps on the relevant scale, applied to the limit **for the grade
context of the chosen exercise**, and clamped. **[R]** When both ends clamp to
the floor the app prints "well below your limit" rather than a nonsense grade.

---

## 7. Exercise library

~45 named sessions with protocols. Each carries `category`, `fingerCost`,
`needs[]` (facilities), `gradeContext` (outdoor/indoor/board), `style`
(comp/outdoor), `loads[]` (body regions) **[R]**, `rehabFor[]` **[R]**,
`youthRestricted` **[R]**, pump range, and protocol fields.

- **Finger:** F1 max deadhang · F2 repeaters · F3 campus · **F4 sub-max
  no-hangs [R]**
- **Rope:** K1–K7, C3 comp simulation (lead)
- **Boulder:** B1–B11, W1 set-your-own, C1 comp simulation, C2 flash session
- **Strength:** S1–S14, **S15 wrist extensor/flexor eccentrics [R]**
- **Mobility:** T1–T5

**[R] F4 was the missing piece.** Rule 2 downgraded to "low-finger" but nothing
in F1–F3 qualified. F4 (10 s on / 50 s off × 6, ~70–80% effort, ≥6 h apart) is
simultaneously the cold-start answer, the deload answer, and the tired-fingers
answer.

**[R] Prehab audit** (the reviewer could not see these): shoulder external
rotation is present (S12) and wrist extensor/flexor eccentrics have been added
(S15) — the two prehab items with the strongest climbing injury rationale.

**[R] F3 is now prescribable**: "2 ladders per set — 1-3-5 up and matched down,
or bumps", not "2 reps".

### 7.1 Selection
```
candidates by session type (ordered, best-fit first)
  → filter by facilities            (skipped entirely when no profile)
  → filter out youthRestricted       if age < 18                  [R]
  → filter out anything loading an injured region,
    unless it is rehabFor that region                             [R]
  → prefer matching discipline (boulder/rope), never to empty
  → rotate by week index
  → stable-sort by style match (comp/outdoor), matching first
  → take 3
```

---

## 8. Periodisation

### 8.1 Without a dated goal
Undulating (weekly pattern) or Linear (Capacity → Strength → Power → Deload),
**with no claim either is superior**. 4:1 loading:deload counted from the first
logged session. Undated goals only bias hard-day quality.

### 8.2 With a dated goal
```
weeks = floor(days_until / 7)
≥12 Base · ≥8 Strength · ≥4 Power · ≥2 Peak · <2 Taper
```
**[R] The deload rhythm is anchored to the countdown**, not to the first logged
session: `deload if weeks ≥4 and weeks % 4 == 0`. v1 counted from a different
origin so a deload could land inside the 2-week peak and gut it. Verified:
deloads at 20/16/12/8/4 weeks out, never in Peak or Taper.

| Phase | Boulder | Rope | Comp override |
|---|---|---|---|
| Base | volume / technique | volume / aerobic | — |
| Strength | fingerStrength / volume | fingerStrength / powerEndurance | — |
| Power | power / powerEndurance | powerEndurance / volume | easy → compSim |
| Peak | limit / technique | limit / **powerEndurance [R]** | hard → compSim |
| Taper | technique / deload | technique / deload | — |

**Combined (Boulder & Lead).** `discipline: 'both'` is a real value, not a
missing one. Disciplines alternate in two-session blocks while hard/easy
alternates every session, so each discipline gets a hard day and an easy one
rather than bouldering taking all the hard days. Verified for a combined comp
18 days out: sessions 1–2 bouldering (comp sim, then technique), sessions 3–4
rope (C3 lead comp sim, then K4 Hard–Hard).

**[R] Rope Peak easy was ARC**, which is a base quality and does nothing in a
peak week.

**[R] Finger maintenance is injected** into any non-deload, non-taper week with
no finger work, replacing one non-high-cost slot. Base could otherwise run 12+
weeks with zero finger stimulus, and it vanished again through Power and Peak.

---

## 9. Weekly structure

```
sessions_week ∈ [2,8]   (values outside are clamped; DB allows 1–14) [R: #24]
trainingDays  = min(n, 6)     ← at least one full rest day, always
doubles       = n − trainingDays
```
Doubles land on already-hard days; second sessions are always low finger cost
(antagonist / mobility / finger maintenance) and ≥6 h later.

**[R] Weekday placement.** With `preferred_days` set, sessions are assigned to
real weekdays and hard days are spread to maximise spacing. The plan reports
`minHardGap`; below 2 days it warns explicitly. Without it, the UI says the plan
can only order sessions, not space them — v1 silently showed a plan that was
wrong for anyone training Fri/Sat/Sun.

---

## 10. Daily decision tree (in order — most limiting wins)

```
0. age < 18 and planned ∈ {fingerStrength, power, limit} → volume
   (plus: youthRestricted exercises filtered out entirely) [R]
1. substantial OSTRC problem this week      → mobility     caution   [R]
2. open injury (region-aware)               → mobility     caution   [R]
3. finger history unknown and planned costly→ fingerMaintenance      [R]
4. fingers loaded/recovering, cost ≥ medium → low-finger type
5. sustained ≥8 weeks of hard finger days   → fingerMaintenance      [R]
6. chronic finger level very-high           → technique              [R]
7. readiness < 38                           → deload
8. planned == deload                        → deload
9. finger ramp flag and cost high           → powerEndurance
10. chronic finger level high and cost high → powerEndurance         [R]
11. load trend sharp and cost high          → volume
12. otherwise → planned; report actual finger state
    (+ monotony > 2 appends "vary the stimulus")
```

**[R] Rules 1–2 prescribe `mobility`, not `antagonist`.** Antagonist work is
largely shoulder and push — the worst available fallback for a shoulder injury.
Region-aware filtering then removes anything loading the affected structure.

**[R] Rule 0 gates on exercise properties, not just session type**, because
campus work (F3, B10) can surface under several type keys. 18–20 is flagged as a
soft watch band, not a restriction — 18 is a chronological proxy for skeletal
maturity and late maturers can still have open growth plates.

---

## 11. Evidence labelling

**Reasonably supported**
- Collagen turnover *timing* → the ≥48 h rule
- Session-RPE as internal load; forearm/finger-localised RPE tracking climbing
  load better than whole-body
- Subjective wellness ≥ HRV for tracking training response
- Coupled ACWR being statistically unsound → uncoupled windows
- Fingers dominating climbing injury epidemiology; youth growth-plate risk
- OSTRC-O as a validated overuse instrument
- Low external-rotation strength as a shoulder-injury association

**Moved out of "supported" [R]**
- **Scheduled deload weeks.** *Adequate recovery* is well supported; *scheduled
  deload weeks* are not, and the evidence points the other way (Coleman/
  Schoenfeld 2024, n=39: a mid-programme deload week negatively affected
  lower-body strength gains with no benefit elsewhere). The 4:1 rhythm is now
  labelled convention.
- **The ~6 h refractory window.** Baar's work is *in vitro* engineered ligament.
  Mechanistically reasonable, not established in human tendon. Labelled a
  mechanistic extrapolation, in the spec and on F4's card.
- **Forearm-localised RPE.** v1 cited the evidence but did not implement it —
  §3.1 used whole-body RPE and `rpe_finger` was a binary trigger. It now drives
  a continuous finger-dose series, so the citation matches the behaviour.

**Heuristic / chosen, not derived**
Every numeric threshold: dose constants (40/15), readiness weights, 10 pts/SD,
trend gates (15 AU/day, 8 active days), monotony gate, ramp factor 1.5,
sustained-run threshold (8 weeks), tier→recovery mapping, grade offsets, phase
boundaries, doubles placement, `fingerCost` labels.

**Known limitations**
- Calendar days, not hours — no session time stored (schema change)
- Comp formats are modelled as boulder, rope, or combined. Not modelled: comp
  *rounds* (qualification / semi / final have different densities), and speed,
  which is out of scope by design
- No per-grip modelling beyond a pockets flag (no crimp vs pinch vs sloper)
- One board type per athlete
- Squared load term under-weights bouldering and easy volume (§3.1)
- Nothing adapts from outcomes — no feedback loop from whether sessions went well
- OSTRC severity gates the decision tree but is not trended over time
- `preferred_days` improves spacing but the app still doesn't know which day
  *today* maps to in the plan when sessions are logged out of order

---

## 12. Review questions (v2)

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
7. Anything still overstating its evidence base?
