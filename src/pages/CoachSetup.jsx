import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Field, NumberField, Segmented, useBack } from '../components/ui'
import { BOULDER_GRADES, ROUTE_GRADES } from '../lib/constants'
import {
  fetchCoachProfile,
  saveCoachProfile,
  fetchGoals,
  addGoal,
  deleteGoal,
  updateGoal,
  GOAL_KINDS,
  GOAL_DISCIPLINES,
  GOAL_STYLES,
  goalKind,
  daysUntil,
  hasOldSchema,
} from '../lib/coachProfile'
import { todayISO, formatDayShort } from '../lib/format'
import { MAX_TRAINING_DAYS } from '../lib/coach'
import { setBodyweight } from '../lib/prefs'
import { fetchFingerTests, fetchPhysicalTests } from '../lib/fingerTests'

// The coach's setup form. Everything here exists because the generator can't
// give a real answer without it: grades scale the prescriptions, facilities
// decide which sessions are even possible, age gates maximal finger loading,
// and a dated goal is what turns a weekly rhythm into a plan that peaks on time.
export default function CoachSetup() {
  const navigate = useNavigate()
  const back = useBack('/coach')
  const [form, setForm] = useState(null)
  const [goals, setGoals] = useState([])
  const [fingerTests, setFingerTests] = useState([])
  const [physicalTests, setPhysicalTests] = useState([])
  const [missingTable, setMissingTable] = useState(false)
  const [oldSchema, setOldSchema] = useState(false)
  const [loading, setLoading] = useState(true)
  const [flash, setFlash] = useState(null)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    try {
      const [p, g, ft, pt] = await Promise.all([
        fetchCoachProfile(),
        fetchGoals(),
        fetchFingerTests().catch(() => []),
        fetchPhysicalTests().catch(() => []),
      ])
      setFingerTests(ft)
      setPhysicalTests(pt)
      if (p?.missingTable) {
        setMissingTable(true)
        setForm(emptyProfile())
      } else {
        // Ran an older coach.sql: the table is there but missing newer fields.
        // Worth saying up front rather than after a save mysteriously fails.
        setOldSchema(hasOldSchema(p))
        setForm({ ...emptyProfile(), ...(p || {}) })
      }
      setGoals(g)
    } catch (err) {
      setError(err.message || 'Could not load')
      setForm(emptyProfile())
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const show = (msg) => {
    setFlash(msg)
    setTimeout(() => setFlash(null), 1600)
  }

  // Auto-save on change, like the rest of Settings.
  const commit = async (patch) => {
    const next = { ...form, ...patch }
    setForm(next)
    try {
      // Strip fields the table doesn't own before writing.
      const { user_id, updated_at, ...rest } = next
      await saveCoachProfile(rest)
      setError(null)
      show('Saved')
    } catch (err) {
      setError(err.message || 'Could not save')
    }
  }

  if (loading || !form) {
    return (
      <div className="splash">
        <div className="spinner" />
      </div>
    )
  }

  return (
    <div className="page">
      <header className="wizard-head">
        <button className="icon-btn" onClick={back} aria-label="Back">
          ‹
        </button>
        <div className="wizard-title">
          <h1>About you</h1>
        </div>
        <span style={{ width: 40 }} />
      </header>

      <main className="wizard-body stack">
        {missingTable && (
          <p className="auth-error">
            The coach tables aren’t set up yet. Run <code>supabase/coach.sql</code> in the
            Supabase SQL editor. Nothing here will save until you do.
          </p>
        )}
        {oldSchema && !missingTable && (
          <p className="auth-error">
            Your coach tables are from an earlier version and are missing some fields, so
            re-run <code>supabase/coach.sql</code>. It’s safe to run again and won’t touch
            what you’ve already saved.
          </p>
        )}

        <p className="muted small">
          The coach can’t give you a real session without knowing what you climb and what
          you have access to. Nothing here is shared with anyone.
        </p>

        {/* ---- grades ---- */}
        <section className="card settings-card stack">
          <h2 className="step-q">Bouldering grades</h2>
          <p className="muted small">
            Fill in whichever you know; you don’t need all three. Board grades run
            stiffer than plastic, and outdoor is its own thing again, so the coach quotes
            grades in the context of whatever session it just suggested rather than
            pretending they’re the same scale.
          </p>
          <Field label="Outdoor" optional>
            <GradeSelect
              grades={BOULDER_GRADES}
              value={form.max_boulder_outdoor}
              onChange={(v) => commit({ max_boulder_outdoor: v })}
            />
          </Field>
          <Field label="Indoor (set boulders)" optional>
            <GradeSelect
              grades={BOULDER_GRADES}
              value={form.max_boulder_indoor}
              onChange={(v) => commit({ max_boulder_indoor: v })}
            />
          </Field>
          <div className="two-col">
            <Field label="Board" optional>
              <GradeSelect
                grades={BOULDER_GRADES}
                value={form.max_boulder_board}
                onChange={(v) => commit({ max_boulder_board: v })}
              />
            </Field>
            <Field label="Which board" optional>
              <select
                value={form.board_type || ''}
                onChange={(e) => commit({ board_type: e.target.value || null })}
              >
                <option value="">-</option>
                <option value="kilter">Kilter</option>
                <option value="moon">Moonboard</option>
                <option value="tension">Tension</option>
                <option value="spray">Spray wall</option>
                <option value="other">Other</option>
              </select>
            </Field>
          </div>
          <Field
            label="Boulder you can flash"
            hint="Indoors, on a normal day. The honest anchor for volume sessions."
            optional
          >
            <GradeSelect
              grades={BOULDER_GRADES}
              value={form.flash_boulder}
              onChange={(v) => commit({ flash_boulder: v })}
            />
          </Field>
        </section>

        <section className="card settings-card stack">
          <h2 className="step-q">Route grades</h2>
          <Field label="Outdoor" optional>
            <GradeSelect
              grades={ROUTE_GRADES}
              value={form.max_route_outdoor}
              onChange={(v) => commit({ max_route_outdoor: v })}
            />
          </Field>
          <Field label="Indoor" optional>
            <GradeSelect
              grades={ROUTE_GRADES}
              value={form.max_route_indoor}
              onChange={(v) => commit({ max_route_indoor: v })}
            />
          </Field>
          <Field label="Route you can onsight" optional>
            <GradeSelect
              grades={ROUTE_GRADES}
              value={form.onsight_route}
              onChange={(v) => commit({ onsight_route: v })}
            />
          </Field>
          <Field label="What are you training for?">
            <Segmented
              options={[
                { key: 'boulder', label: 'Bouldering' },
                { key: 'route', label: 'Routes' },
                { key: 'both', label: 'Both' },
              ]}
              value={form.focus || 'both'}
              onChange={(v) => commit({ focus: v })}
              columns={3}
            />
          </Field>
        </section>

        {/* ---- schedule + age ---- */}
        <section className="card settings-card stack">
          <h2 className="step-q">You</h2>
          <Field label="Sessions per week">
            <Segmented
              options={[2, 3, 4, 5, 6, 7, 8].map((n) => ({ key: String(n), label: String(n) }))}
              value={String(form.sessions_week || 3)}
              onChange={(v) => commit({ sessions_week: Number(v) })}
              columns={4}
            />
          </Field>
          <p className="muted small">
            {sessionsNote(form.sessions_week || 3)}
          </p>

          <Field
            label="Which days do you train?"
            hint="Without this the plan can order your sessions but not space them, and hard/easy alternation means nothing if you train three days in a row."
            optional
          >
            <div className="chips">
              {WEEKDAYS.map((d) => {
                const on = (form.preferred_days || []).includes(d.n)
                return (
                  <button
                    key={d.n}
                    type="button"
                    className={`chip ${on ? 'is-active' : ''}`}
                    onClick={() => {
                      const cur = form.preferred_days || []
                      const next = on ? cur.filter((x) => x !== d.n) : [...cur, d.n].sort()
                      commit({ preferred_days: next.length ? next : null })
                    }}
                  >
                    {d.label}
                  </button>
                )
              })}
            </div>
          </Field>
          <div className="two-col">
            <Field label="Birth year" hint="Sets a safety cap under 18." optional>
              <NumberField
                value={form.birth_year ?? ''}
                onChange={(v) => commit({ birth_year: v === '' ? null : Number(v) })}
                placeholder="1995"
                step="1"
                min={1900}
              />
            </Field>
            <Field label="Climbing since" optional>
              <NumberField
                value={form.climbing_since ?? ''}
                onChange={(v) => commit({ climbing_since: v === '' ? null : Number(v) })}
                placeholder="2015"
                step="1"
                min={1900}
              />
            </Field>
          </div>
        </section>

        {/* ---- facilities ---- */}
        <section className="card settings-card stack">
          <h2 className="step-q">What you have access to</h2>
          <p className="muted small">
            The coach only suggests sessions you can actually do. No spray wall, no
            circuits.
          </p>
          <div className="toggle-list">
            {[
              ['has_hangboard', '🪝', 'Hangboard'],
              ['has_campus', '🪜', 'Campus board'],
              ['has_spraywall', '🧗', 'Spray / training wall'],
              ['has_gym', '🏋', 'Weights & rings'],
            ].map(([key, emoji, label]) => (
              <label className="toggle-row" key={key}>
                <span className="toggle-label">
                  <span className="toggle-emoji">{emoji}</span>
                  {label}
                </span>
                <span className="switch">
                  <input
                    type="checkbox"
                    checked={!!form[key]}
                    onChange={() => commit({ [key]: !form[key] })}
                  />
                  <span className="switch-track" />
                  <span className="switch-thumb" />
                </span>
              </label>
            ))}
          </div>
        </section>

        {/* ---- bodyweight ---- */}
        <section className="card settings-card stack">
          <h2 className="step-q">Bodyweight</h2>
          <p className="muted small">
            Only used to turn a percentage into kilos. “85% of max” is a number you can
            set up on a board, and whether that means adding weight or taking it off
            depends on this. Nothing else reads it.
          </p>
          <Field label="Bodyweight" optional>
            <NumberField
              value={form.bodyweight_kg ?? ''}
              onChange={(v) => {
                const kg = v === '' ? null : Number(v)
                setBodyweight(kg)
                commit({ bodyweight_kg: kg })
              }}
              placeholder="70"
              unit="kg"
            />
          </Field>
          <p className="muted small">
            One current value. The app deliberately keeps no weight history and draws no
            weight chart: climbing has a well-documented problem with disordered eating,
            and a weight trend sitting next to performance numbers is a known part of it.
            If you would rather not enter it at all, test on the minimum-edge protocol
            below instead; that one needs no bodyweight.
          </p>
        </section>

        {/* Testing moved to its own tab: this form is a one-off, and testing
            is something you come back to every few months. */}
        <button
          type="button"
          className="btn btn-secondary btn-block settings-link-row"
          onClick={() => navigate('/coach/tests')}
        >
          <span>
            📋 Tests
            {fingerTests.length + physicalTests.length
              ? ` · ${fingerTests.length + physicalTests.length} results`
              : ''}
          </span>
          <span className="settings-link-arrow">›</span>
        </button>

        {/* ---- injuries ---- */}
        <section className="card settings-card stack">
          <h2 className="step-q">Injury history</h2>
          <p className="muted small">
            Anything that flares up: old pulley injuries, elbows, shoulders. Previous
            injury is one of the few risk factors that holds up consistently, so the coach
            stays more conservative when there’s history here.
          </p>
          <textarea
            rows={4}
            maxLength={2000}
            value={form.injury_history ?? ''}
            onChange={(e) => setForm({ ...form, injury_history: e.target.value })}
            onBlur={() => commit({ injury_history: form.injury_history?.trim() || null })}
            placeholder="e.g. A2 pulley, right ring finger, 2023, still tweaky on small crimps"
          />
        </section>

        {/* ---- goals ---- */}
        <GoalsSection goals={goals} onChanged={load} />

        {error && <p className="auth-error">{error}</p>}
        <p className="muted small settings-autosave">Changes are saved automatically.</p>
      </main>

      {flash && <div className="toast">{flash}</div>}
    </div>
  )
}

// What a given weekly volume actually means once a full rest day is protected.
function sessionsNote(n) {
  const days = Math.min(n, MAX_TRAINING_DAYS)
  const doubles = n - days
  const rest = 7 - days
  if (!doubles) {
    return `${days} training day${days === 1 ? '' : 's'} and ${rest} rest day${rest === 1 ? '' : 's'}.`
  }
  return `${days} training days with ${doubles} double${doubles === 1 ? '' : 's'}, and ${rest} full rest day${rest === 1 ? '' : 's'}. Second sessions are kept light and at least ~6 hours after the first, since two hard sessions in a day is how people get hurt.`
}

const WEEKDAYS = [
  { n: 1, label: 'Mon' }, { n: 2, label: 'Tue' }, { n: 3, label: 'Wed' },
  { n: 4, label: 'Thu' }, { n: 5, label: 'Fri' }, { n: 6, label: 'Sat' },
  { n: 7, label: 'Sun' },
]

// Finger tests, per grip and per protocol.
//
// The big change from v3: intensity is a percentage of TOTAL load, bodyweight
// included. A percentage of *added* weight is ~100% of real tissue load, so
// the old single "added weight" field made every prescribed hang near-maximal.

function emptyProfile() {
  return {
    birth_year: null, climbing_since: null,
    max_boulder: null, max_route: null, flash_boulder: null, onsight_route: null,
    max_boulder_outdoor: null, max_boulder_indoor: null, max_boulder_board: null,
    max_route_outdoor: null, max_route_indoor: null, board_type: null,
    sessions_week: 3,
    has_hangboard: false, has_campus: false, has_spraywall: false, has_gym: false,
    hang_max_kg: null, hang_edge_mm: null, hang_tested_on: null, bodyweight_kg: null,
    preferred_days: null, injury_history: null, focus: 'both',
  }
}

function GradeSelect({ grades, value, onChange }) {
  return (
    <select value={value || ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">-</option>
      {grades.map((g) => (
        <option key={g} value={g}>{g}</option>
      ))}
    </select>
  )
}

// Goals drive the periodisation: the soonest dated goal is what the plan counts
// back from.
function GoalsSection({ goals, onChanged }) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const startAdd = () => {
    setDraft({
      title: '', kind: 'competition', discipline: 'boulder', style: 'comp',
      target_date: todayISO(), grade: null, notes: '',
    })
    setAdding(true)
    setErr(null)
  }

  const save = async () => {
    if (!draft.title.trim()) return
    setBusy(true)
    try {
      await addGoal({
        title: draft.title.trim(),
        kind: draft.kind,
        discipline: draft.discipline,
        style: draft.style,
        target_date: draft.target_date || null,
        grade: draft.grade || null,
        notes: draft.notes?.trim() || null,
      })
      setAdding(false)
      setDraft(null)
      onChanged()
    } catch (e) {
      setErr(e.message || 'Could not save. Has supabase/coach.sql been run?')
    }
    setBusy(false)
  }

  const remove = async (id) => {
    await deleteGoal(id).catch(() => {})
    onChanged()
  }

  const toggleDone = async (g) => {
    await updateGoal(g.id, { achieved: !g.achieved }).catch(() => {})
    onChanged()
  }

  const kindDated = GOAL_KINDS.find((k) => k.key === draft?.kind)?.dated

  return (
    <section className="card settings-card stack">
      <h2 className="step-q">Goals</h2>
      <p className="muted small">
        What you’re working toward. A goal with a date is what turns the weekly rhythm
        into a plan that peaks on time, counting back from the soonest one.
      </p>

      {goals.length === 0 && !adding && (
        <p className="muted small">No goals yet.</p>
      )}

      <div className="stack">
        {goals.map((g) => {
          const kind = goalKind(g.kind)
          const days = daysUntil(g)
          return (
            <div className={`goal-row ${g.achieved ? 'is-done' : ''}`} key={g.id}>
              <span className="goal-emoji">{kind.emoji}</span>
              <div className="goal-main">
                <span className="goal-title">{g.title}</span>
                <span className="muted small">
                  {kind.label}
                  {g.discipline && g.discipline !== 'both'
                    ? ` · ${g.discipline === 'rope' ? 'Rope' : 'Bouldering'}`
                    : ''}
                  {g.style ? ` · ${g.style === 'comp' ? 'Comp' : 'Outdoor'}` : ''}
                  {g.grade ? ` · ${g.grade}` : ''}
                  {g.target_date ? ` · ${formatDayShort(g.target_date)}` : ''}
                  {days != null && days >= 0 && !g.achieved
                    ? ` · ${days === 0 ? 'today' : `in ${days} day${days === 1 ? '' : 's'}`}`
                    : ''}
                </span>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={() => toggleDone(g)}
                aria-label={g.achieved ? 'Mark as not achieved' : 'Mark as achieved'}
                title={g.achieved ? 'Achieved' : 'Mark achieved'}
              >
                {g.achieved ? '✓' : '○'}
              </button>
              <button
                type="button"
                className="icon-btn"
                onClick={() => remove(g.id)}
                aria-label="Delete goal"
              >
                ✕
              </button>
            </div>
          )
        })}
      </div>

      {adding && draft ? (
        <div className="stack">
          <Field label="What is it?">
            <input
              type="text"
              value={draft.title}
              maxLength={120}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="e.g. Norwegian Boulder Champs, or send 8A"
              autoFocus
            />
          </Field>
          <Field label="Kind">
            <Segmented
              options={GOAL_KINDS.map((k) => ({ key: k.key, label: k.label }))}
              value={draft.kind}
              onChange={(v) => setDraft({ ...draft, kind: v })}
              columns={3}
            />
          </Field>
          <p className="muted small">{goalKind(draft.kind).hint}</p>

          <Field label="Discipline">
            <Segmented
              options={GOAL_DISCIPLINES.map((d) => ({ key: d.key, label: d.label }))}
              value={draft.discipline}
              onChange={(v) => setDraft({ ...draft, discipline: v, grade: null })}
              columns={3}
            />
          </Field>
          <p className="muted small">
            {draft.discipline === 'rope'
              ? 'The countdown will build toward sustained hard climbing and pump tolerance: circuits, linked moves, routes.'
              : draft.discipline === 'boulder'
                ? 'The countdown will build toward max recruitment and power: limit boulders, campus, hard moves.'
                : 'No specialisation, so the countdown keeps both going.'}
          </p>

          <Field label="Style">
            <Segmented
              options={GOAL_STYLES.map((s) => ({ key: s.key, label: s.label }))}
              value={draft.style}
              onChange={(v) => setDraft({ ...draft, style: v })}
              columns={2}
            />
          </Field>
          <p className="muted small">
            {draft.style === 'comp'
              ? 'Peaks on performing cold: unseen climbing, on the clock, first go. Competition simulation replaces projecting near the date, because projecting doesn’t train reading a problem you’ve never seen.'
              : 'Peaks on projecting: the same moves refined until they go, on small holds, with long rests.'}
          </p>

          <Field
            label="Date"
            hint={kindDated ? 'The plan will peak for this.' : 'Add one and the plan peaks for it.'}
            optional={!kindDated}
          >
            <input
              type="date"
              value={draft.target_date || ''}
              onChange={(e) => setDraft({ ...draft, target_date: e.target.value })}
            />
          </Field>

          {draft.kind === 'grade' && (
            <Field label="Target grade" optional>
              <GradeSelect
                grades={draft.discipline === 'rope' ? ROUTE_GRADES : BOULDER_GRADES}
                value={draft.grade}
                onChange={(v) => setDraft({ ...draft, grade: v })}
              />
            </Field>
          )}

          {err && <p className="auth-error">{err}</p>}
          <div className="settings-danger-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setAdding(false)
                setDraft(null)
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={save}
              disabled={!draft.title.trim() || busy}
            >
              {busy ? 'Saving…' : 'Add goal'}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn btn-secondary btn-block" onClick={startAdd}>
          + Add a goal
        </button>
      )}
    </section>
  )
}
