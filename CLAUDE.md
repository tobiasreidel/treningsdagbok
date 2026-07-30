# Treningsdagbok, working notes

Personal multi-sport training diary (cycling, running, swimming, climbing,
strength, fingerboard), shipped as an installable PWA. React 18 + Vite +
React Router, Supabase (Postgres + auth + storage) as the whole backend.
Used by the owner and a handful of friends, so build for that scale, not for an
enterprise.

## Commands

```bash
npm run dev     # vite, :5173
npm run test    # vitest, the pure-logic tests in src/lib/*.test.js
npm run build   # ALWAYS run before pushing; main auto-deploys to prod

npx supabase db push   # apply migrations (see supabase/README.md)
```

No linter. The tests cover the coach engine, the finger-load maths and the
golden fixtures, the parts where a wrong answer is invisible on inspection, so
the build is still the gate for everything else. Push to `main` and Vercel
deploys it.

`src/lib/coachFixtures.test.js` holds ~20 synthetic athletes snapshotted through
the whole readout. Change a coach constant and the diff shows the blast radius;
update with `npm run test -- -u` **after reading the diff**, never before.
There is also a dev-only bench at `/coach/simulator` for watching signals move.

## Layout

- `src/pages/`: one file per route (see `App.jsx` for the table). Routes are
  lazy-loaded; only `Dashboard` is in the first download.
- `src/components/`: shared UI. `ui.jsx` holds the primitives (`Field`,
  `Segmented`, `PillRow`, `useBack`); `charts.jsx` the SVG charts;
  `form/` the register-session wizard steps.
- `src/lib/`: every bit of logic, no JSX. One module per domain
  (`sessions`, `health`, `wellness`, `friends`, `gear`, `streams`, …), each
  owning its own Supabase queries.
- `src/styles.css`: one stylesheet, plain CSS variables, themes via
  `[data-theme]`. No CSS framework, no CSS-in-JS.
- `supabase/migrations/`: `<timestamp>_<name>.sql`, applied in filename order
  with `npx supabase db push`. Write it idempotent (`if not exists`, `drop
  policy if exists`), one contiguous block per table so a failed statement can
  never leave a table created but unprotected, and still guard reads against a
  missing table (`isMissingTable`) so a half-migrated install degrades instead
  of erroring. Never assume a migration has run.
- `api/`: two Vercel functions (account deletion, feedback). Everything else
  talks to Supabase directly, protected by RLS.

## Conventions that matter

- **Local vs server state.** Everything a user chooses is server state. Display
  preferences live in `lib/prefs.js`, one row per setting in `user_prefs`;
  localStorage holds a per-user copy so the getters can stay synchronous and
  the first paint costs no round-trip, but it is a cache and never the source
  of truth. `loadPrefs()` fills it at sign-in (awaited in `AuthContext` before
  the app renders), setters write through, and a write made offline stays
  pending until `flushPrefs()`. Add a setting by adding a getter/setter pair
  over `getPref`/`setPref`: no migration needed, and `prefs.js` stays the only
  place that interprets the stored values.
- **Cross-component refresh** is by window event, not a store:
  `sessions:changed` / `coach:changed`. Dispatch after a write, listen in
  whatever needs to re-read.
- **Writes are offline-safe**: `lib/outbox.js` queues them in IndexedDB and
  `App.jsx` flushes on load and on `online`.
- **The coach engine** (`lib/coach.js`) is pure: it takes data in and returns
  a readout. Never call `coachReadout` directly from a component: assemble
  inputs with `loadCoachInputs()` and derive with `readoutFrom()` from
  `lib/coachData.js`, so every screen reads the same signals. The exercise
  library is data in `lib/exercises.js`.
- **Never read `sessions.extra` directly.** `lib/sessionShape.js` is the only
  place that interprets it: `normaliseSession(row, { bodyweight })` returns
  hangboard loads resolved to total kilos (or an explicit null), `campus` as the
  enum it is, grades parsed. Three shipped bugs were three consumers reading
  that blob independently and drifting apart. Writes stamp
  `extra.schema_version`; absent means v3 or older.
- **Fitted, not chosen, where possible.** `expectedDose` in the library is
  effectively a labelled dataset: the dose coefficients in `coach.js` are fitted
  to reproduce it, so refit and re-check the library if you touch them. Say in
  the copy which numbers are findings and which were picked so the model
  behaves.
- **Units are metric**, dates are ISO `yyyy-MM-dd` strings via `lib/format.js`
  (`todayISO`, `asDate`), not `Date` objects in state.
- **Comments explain why, not what.** The existing ones carry real reasoning
  (why an exponent is 3, why a rule was dropped); match that and leave them
  alone unless the reasoning changed.
- **User-facing copy is plain language**: this is for climbers, not doctors.
  The coach never gives an injury-risk number, and says pain is the real
  signal. No em dashes anywhere in copy or comments; use a colon, a comma, a
  semicolon or two sentences. Say a thing once and trust the reader: a hint
  that only restates its own label is noise, so drop it.
- **Ship notes**: add an entry to `src/lib/changelog.js` whenever something
  user-visible changes. It renders as the in-app "What's new".
- **Reads go through the cache.** `fetchSessions()` collapses concurrent
  callers, stores a copy in IndexedDB and serves it when the server can't be
  reached (`lib/sessionCache.js`). Any write must call
  `notifySessionsChanged()`, which is what drops it.

## Gotchas

- Anything reading the coach's signals must pass the finger/physical tests, and
  `loadCoachInputs` does this for you. Skipping them silently rescores
  hangboard sessions off edge size alone.
- The service worker precaches the built assets and updates with a prompt
  (`components/UpdatePrompt.jsx`); `registerType: 'prompt'`, registration
  happens there and nowhere else.
- intervals.icu is optional. Absent credentials is a normal state, never an
  error, and features degrade to what the logged sessions alone can show.
