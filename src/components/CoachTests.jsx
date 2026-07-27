import { useState } from 'react'
import { Field, NumberField, Segmented } from './ui'
import {
  TEST_BATTERY,
  TEST_GROUPS,
  testMeta,
  latestPerTest,
  addFingerTest,
  deleteFingerTest,
  deletePhysicalTest,
  logTestSession,
} from '../lib/fingerTests'
import { GRIPS, HANG_PROTOCOLS, gripLabel, maxTotalFor } from '../lib/fingerLoad'
import { createSession, notifySessionsChanged } from '../lib/sessions'
import { todayISO, formatDayShort } from '../lib/format'

// The test battery: what each test is, how to run it, what your last number
// was, and the form for a testing session.
//
// Split from the coach's setup screen on purpose. Setting the coach up is a
// one-off; testing is something you come back to every few months, and it was
// buried at the bottom of a form you had no other reason to open.
export default function CoachTests({ tests, fingerTests, profile, onProfilePatch, onChanged }) {
  const [open, setOpen] = useState(null) // test id whose instructions are shown
  const [session, setSession] = useState(null) // the testing session in progress
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [done, setDone] = useState(null)

  const latest = latestPerTest(tests)
  const byKey = new Map(latest.map((t) => [`${t.test_id}:${t.side || ''}`, t]))

  const startSession = () => {
    setDone(null)
    setErr(null)
    setSession({ tested_on: todayISO(), duration: '', notes: '', results: {} })
  }

  // One row per test *and side*, because a left and a right are two results.
  const rowKey = (id, side) => `${id}:${side || ''}`

  const setResult = (id, side, patch) => {
    const key = rowKey(id, side)
    setSession((s) => ({
      ...s,
      results: { ...s.results, [key]: { test_id: id, side, value: '', ...s.results[key], ...patch } },
    }))
  }

  const clearResult = (id, side) => {
    setSession((s) => {
      const next = { ...s.results }
      delete next[rowKey(id, side)]
      return { ...s, results: next }
    })
  }

  const entered = session ? Object.values(session.results) : []
  const enteredCount = entered.filter((r) => r.value !== '' || r.aborted_reason).length

  const save = async () => {
    setBusy(true)
    setErr(null)
    try {
      const { count, session: sessionRow } = await logTestSession({
        tested_on: session.tested_on,
        duration: session.duration,
        notes: session.notes,
        results: entered,
      })
      await createSession(sessionRow)
      notifySessionsChanged()
      setSession(null)
      setDone(`Saved ${count} result${count === 1 ? '' : 's'}, and added the session to your diary.`)
      onChanged()
    } catch (e) {
      setErr(e.message || 'Could not save. Has supabase/coach_v4.sql been run?')
    }
    setBusy(false)
  }

  const remove = async (id) => {
    await deletePhysicalTest(id).catch(() => {})
    onChanged()
  }

  return (
    <div className="stack">
      <section className="card settings-card stack">
        <h2 className="step-q">Testing</h2>
        <p className="muted small">
          A test is only worth anything next to the last one, so run them the way the
          instructions describe and change nothing between rounds. Every few months is
          plenty — testing is a hard session in itself, and it belongs on a fresh day, not
          at the end of a tiring week.
        </p>
        {!session && (
          <button type="button" className="btn btn-primary btn-block" onClick={startSession}>
            Start a testing session
          </button>
        )}
        {done && <p className="muted small">{done}</p>}
      </section>

      {session && (
        <section className="card settings-card stack">
          <h2 className="step-q">Testing session</h2>
          <div className="two-col">
            <Field label="Date">
              <input
                type="date"
                value={session.tested_on}
                max={todayISO()}
                onChange={(e) => setSession({ ...session, tested_on: e.target.value })}
              />
            </Field>
            <Field label="How long">
              <NumberField
                value={session.duration}
                onChange={(v) => setSession({ ...session, duration: v })}
                unit="min"
                placeholder="60"
              />
            </Field>
          </div>
          <p className="muted small">
            Fill in only what you actually tested. It saves as a session in your diary too,
            so a testing day isn’t a hole in your training log — and a maximal finger test
            counts as the hard finger day it is.
          </p>
          {err && <p className="auth-error">{err}</p>}
          <div className="settings-danger-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setSession(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || enteredCount === 0}
              onClick={save}
            >
              {busy ? 'Saving…' : `Save ${enteredCount || ''} result${enteredCount === 1 ? '' : 's'}`}
            </button>
          </div>
        </section>
      )}

      {profile?.has_hangboard && (
        <FingerTestsSection
          profile={profile}
          tests={fingerTests}
          onChanged={onChanged}
          onMigrate={onProfilePatch}
        />
      )}

      {TEST_GROUPS.map((g) => (
        <section className="card settings-card stack" key={g.key}>
          <h2 className="step-q">{g.label}</h2>
          {TEST_BATTERY.filter((t) => t.group === g.key).map((t) => {
            const sides = t.bilateral ? ['R', 'L'] : ['']
            const isOpen = open === t.id
            return (
              <div className="test-item" key={t.id}>
                <button
                  type="button"
                  className="test-item-head"
                  onClick={() => setOpen(isOpen ? null : t.id)}
                  aria-expanded={isOpen}
                >
                  <span className="test-item-main">
                    <span className="goal-title">{t.label}</span>
                    <span className="muted small">
                      {sides
                        .map((side) => {
                          const row = byKey.get(rowKey(t.id, side))
                          const prefix = side ? `${side}: ` : ''
                          if (!row) return `${prefix}not tested`
                          if (row.aborted_reason) return `${prefix}stopped (${row.aborted_reason})`
                          return `${prefix}${row.value} ${row.unit || t.unit}`
                        })
                        .join('  ·  ')}
                      {byKey.get(rowKey(t.id, sides[0]))
                        ? ` · ${formatDayShort(byKey.get(rowKey(t.id, sides[0])).tested_on)}`
                        : ''}
                    </span>
                  </span>
                  <span className="test-item-chevron">{isOpen ? '⌃' : '⌄'}</span>
                </button>

                {isOpen && (
                  <div className="test-item-body stack">
                    <p className="muted small">
                      <strong>How:</strong> {t.how}
                    </p>
                    <p className="muted small">
                      <strong>Why:</strong> {t.why}
                    </p>
                  </div>
                )}

                {session && (
                  <div className="test-entry stack">
                    {sides.map((side) => {
                      const r = session.results[rowKey(t.id, side)]
                      return (
                        <div className="test-entry-row" key={side || 'one'}>
                          {side && <span className="test-side">{side}</span>}
                          <NumberField
                            value={r?.value ?? ''}
                            onChange={(v) =>
                              v === '' && !r?.aborted_reason
                                ? clearResult(t.id, side)
                                : setResult(t.id, side, { value: v })
                            }
                            unit={t.unit}
                            placeholder={t.unit}
                          />
                          <button
                            type="button"
                            className={`chip ${r?.aborted_reason === 'pain' ? 'is-active' : ''}`}
                            onClick={() =>
                              setResult(t.id, side, {
                                aborted_reason: r?.aborted_reason === 'pain' ? '' : 'pain',
                                value: '',
                              })
                            }
                          >
                            Pain
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </section>
      ))}

      {tests.length > 0 && (
        <section className="card settings-card stack">
          <h2 className="step-q">Every result</h2>
          {tests.map((t) => (
            <div className="goal-row" key={t.id}>
              <span className="goal-emoji">{t.aborted_reason === 'pain' ? '⚠️' : '📋'}</span>
              <div className="goal-main">
                <span className="goal-title">
                  {testMeta(t.test_id).label}
                  {t.side ? ` · ${t.side}` : ''}
                </span>
                <span className="muted small">
                  {t.aborted_reason
                    ? `Stopped — ${t.aborted_reason}`
                    : `${t.value} ${t.unit || testMeta(t.test_id).unit}`}{' '}
                  · {formatDayShort(t.tested_on)}
                  {t.notes ? ` · ${t.notes}` : ''}
                </span>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={() => remove(t.id)}
                aria-label="Delete result"
              >
                ✕
              </button>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}

function FingerTestsSection({ profile, tests, onChanged, onMigrate }) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState(null)
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)

  const bw = Number(profile.bodyweight_kg) || 0
  const resolved = maxTotalFor(profile, tests, 'halfcrimp')
  // A legacy added-weight max we can convert, once a bodyweight exists.
  const legacyAdded = Number(profile.hang_max_kg) || 0
  const canMigrate = legacyAdded > 0 && bw > 0

  const startAdd = () => {
    setDraft({
      tested_on: todayISO(),
      protocol: 'total_load',
      grip: 'halfcrimp',
      edge_mm: profile.hang_edge_mm || 20,
      hands: 'two',
      value: '',
      value_left: '',
      aborted_reason: '',
    })
    setAdding(true)
    setErr(null)
  }

  const save = async () => {
    setBusy(true)
    try {
      await addFingerTest({
        tested_on: draft.tested_on,
        protocol: draft.protocol,
        grip: draft.grip,
        edge_mm: draft.edge_mm === '' ? null : Number(draft.edge_mm),
        hands: draft.hands,
        value: draft.value === '' ? null : Number(draft.value),
        value_left:
          draft.hands === 'one' && draft.value_left !== '' ? Number(draft.value_left) : null,
        bodyweight_at_test: bw || null,
        aborted_reason: draft.aborted_reason || null,
      })
      setAdding(false)
      setDraft(null)
      onChanged()
    } catch (e) {
      setErr(e.message || 'Could not save. Has supabase/coach_v4.sql been run?')
    }
    setBusy(false)
  }

  const remove = async (id) => {
    await deleteFingerTest(id).catch(() => {})
    onChanged()
  }

  return (
    <section className="card settings-card stack">
      <h2 className="step-q">Finger tests</h2>
      <p className="muted small">
        Recorded as <strong>total load — bodyweight included</strong>. Hangs are prescribed
        as a percentage of this, and the percentage only means anything if both sides use
        the same number: 85% of your <em>added</em> weight is about 99% of what your fingers
        actually hold.
      </p>

      {legacyAdded > 0 && (
        <div className={canMigrate ? 'coach-finger coach-finger-ok' : 'coach-finger coach-finger-warn'}>
          <div className="coach-finger-row">
            <span className="coach-finger-label">Older max on file</span>
            <span className="coach-finger-state">+{legacyAdded} kg added</span>
          </div>
          <p className="muted small coach-finger-hint">
            {canMigrate ? (
              <>
                That was recorded as <em>added</em> weight, which is {legacyAdded + bw} kg in
                total at your current bodyweight. Save it as a test to keep using it, or
                retest — a max recorded at a different bodyweight isn’t really comparable.
              </>
            ) : (
              <>
                That was recorded as <em>added</em> weight. Until you enter a bodyweight the
                coach can’t convert it, so it will prescribe hangs by effort rather than in
                kilos rather than guess.
              </>
            )}
          </p>
          {canMigrate && (
            <button
              type="button"
              className="btn btn-secondary btn-block"
              onClick={async () => {
                await addFingerTest({
                  tested_on: profile.hang_tested_on || todayISO(),
                  protocol: 'total_load',
                  grip: 'halfcrimp',
                  edge_mm: profile.hang_edge_mm || 20,
                  hands: 'two',
                  value: legacyAdded + bw,
                  bodyweight_at_test: bw,
                  notes: 'Converted from an added-weight max',
                }).catch(() => {})
                onMigrate({ hang_max_kg: null })
                onChanged()
              }}
            >
              Convert to {legacyAdded + bw} kg total
            </button>
          )}
        </div>
      )}

      <div className="stack">
        {tests.length === 0 && !adding && <p className="muted small">No tests yet.</p>}
        {tests.map((t) => (
          <div className="goal-row" key={t.id}>
            <span className="goal-emoji">{t.aborted_reason === 'pain' ? '⚠️' : '🤏'}</span>
            <div className="goal-main">
              <span className="goal-title">
                {t.aborted_reason
                  ? `Stopped — ${t.aborted_reason}`
                  : t.protocol === 'min_edge'
                    ? `${t.value} mm minimum edge`
                    : `${t.value} kg total${t.hands === 'one' ? ` / ${t.value_left ?? '—'} kg left` : ''}`}
              </span>
              <span className="muted small">
                {gripLabel(t.grip)}
                {t.edge_mm ? ` · ${t.edge_mm} mm` : ''}
                {t.hands === 'one' ? ' · one hand' : ''} · {formatDayShort(t.tested_on)}
              </span>
            </div>
            <button
              type="button"
              className="icon-btn"
              onClick={() => remove(t.id)}
              aria-label="Delete test"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {resolved.kg ? (
        <p className="muted small">
          Prescribing from <strong>{Math.round(resolved.kg)} kg total</strong>
          {resolved.derived ? ' (converted)' : ''}
          {resolved.stale
            ? ` — but that test is ${resolved.weeks} weeks old, so kilos aren’t quoted until you retest.`
            : resolved.warn
              ? ` — tested ${resolved.weeks} weeks ago, worth retesting soon.`
              : '.'}
        </p>
      ) : (
        <p className="muted small">
          {resolved.reason === 'needs-bodyweight'
            ? 'Add a bodyweight above and the older max becomes usable.'
            : 'Add a test and the coach can prescribe hangs in kilos instead of “heavy”.'}
        </p>
      )}

      {adding && draft ? (
        <div className="stack">
          <Field label="Protocol">
            <Segmented
              options={HANG_PROTOCOLS.map((p) => ({ key: p.key, label: p.label }))}
              value={draft.protocol}
              onChange={(v) => setDraft({ ...draft, protocol: v })}
              columns={2}
            />
          </Field>
          <p className="muted small">
            {HANG_PROTOCOLS.find((p) => p.key === draft.protocol)?.hint}
          </p>

          <Field label="Grip">
            <select
              value={draft.grip}
              onChange={(e) => setDraft({ ...draft, grip: e.target.value })}
            >
              {GRIPS.map((g) => (
                <option key={g.key} value={g.key}>
                  {g.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Hands">
            <Segmented
              options={[
                { key: 'two', label: 'Two hands' },
                { key: 'one', label: 'One hand' },
              ]}
              value={draft.hands}
              onChange={(v) => setDraft({ ...draft, hands: v })}
              columns={2}
            />
          </Field>

          <div className="two-col">
            <Field
              label={draft.protocol === 'min_edge' ? 'Smallest edge' : 'Total load'}
              hint={draft.protocol === 'min_edge' ? null : 'Bodyweight included'}
            >
              <NumberField
                value={draft.value}
                onChange={(v) => setDraft({ ...draft, value: v })}
                placeholder={draft.protocol === 'min_edge' ? '12' : String(Math.round(bw) || 70)}
                unit={draft.protocol === 'min_edge' ? 'mm' : 'kg'}
              />
            </Field>
            {draft.hands === 'one' ? (
              <Field label="Left hand">
                <NumberField
                  value={draft.value_left}
                  onChange={(v) => setDraft({ ...draft, value_left: v })}
                  placeholder="—"
                  unit={draft.protocol === 'min_edge' ? 'mm' : 'kg'}
                />
              </Field>
            ) : (
              <Field label="Edge" optional>
                <NumberField
                  value={draft.edge_mm}
                  onChange={(v) => setDraft({ ...draft, edge_mm: v })}
                  placeholder="20"
                  unit="mm"
                  step="1"
                />
              </Field>
            )}
          </div>

          <Field label="Date">
            <input
              type="date"
              value={draft.tested_on}
              onChange={(e) => setDraft({ ...draft, tested_on: e.target.value })}
            />
          </Field>

          <Field
            label="Stopped early?"
            hint="A test you stopped because it hurt is the most useful thing the battery can record — it must never be left blank."
            optional
          >
            <Segmented
              options={[
                { key: '', label: 'Completed' },
                { key: 'pain', label: 'Pain' },
                { key: 'skin', label: 'Skin' },
                { key: 'other', label: 'Other' },
              ]}
              value={draft.aborted_reason}
              onChange={(v) => setDraft({ ...draft, aborted_reason: v })}
              columns={4}
            />
          </Field>
          {draft.aborted_reason === 'pain' && (
            <p className="auth-error">
              This will be recorded as a finger problem and the coach will route around it
              for the next two weeks. Persistent finger pain is worth a qualified opinion,
              not an app’s.
            </p>
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
            <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
              {busy ? 'Saving…' : 'Add test'}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn btn-secondary btn-block" onClick={startAdd}>
          + Add a finger test
        </button>
      )}
    </section>
  )
}
