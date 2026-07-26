# Treningsdagbok — working notes

Personal multi-sport training diary (cycling, running, swimming, climbing,
strength, fingerboard), shipped as an installable PWA. React 18 + Vite +
React Router, Supabase (Postgres + auth + storage) as the whole backend.
Used by the owner and a handful of friends — build for that scale, not for an
enterprise.

## Commands

```bash
npm run dev     # vite, :5173
npm run build   # ALWAYS run before pushing — main auto-deploys to prod
```

No test suite and no linter: the build is the only gate. Push to `main` and
Vercel deploys it.

## Layout

- `src/pages/` — one file per route (see `App.jsx` for the table). Routes are
  lazy-loaded; only `Dashboard` is in the first download.
- `src/components/` — shared UI. `ui.jsx` holds the primitives (`Field`,
  `Segmented`, `PillRow`, `useBack`); `charts.jsx` the SVG charts;
  `form/` the register-session wizard steps.
- `src/lib/` — every bit of logic, no JSX. One module per domain
  (`sessions`, `health`, `wellness`, `friends`, `gear`, `streams`, …), each
  owning its own Supabase queries.
- `src/styles.css` — one stylesheet, plain CSS variables, themes via
  `[data-theme]`. No CSS framework, no CSS-in-JS.
- `supabase/*.sql` — migrations, applied **by hand** in the Supabase SQL
  editor. Write the file, tell the user to run it; never assume it has run.
  Guard reads against a missing table (`isMissingTable`) so an un-migrated
  install degrades instead of erroring.
- `api/` — two Vercel functions (account deletion, feedback). Everything else
  talks to Supabase directly, protected by RLS.

## Conventions that matter

- **Local vs server state.** Display preferences live in `lib/prefs.js`
  (localStorage, per device, no migration). Anything another device or person
  must see goes in Postgres.
- **Cross-component refresh** is by window event, not a store:
  `sessions:changed` / `coach:changed` — dispatch after a write, listen in
  whatever needs to re-read.
- **Writes are offline-safe**: `lib/outbox.js` queues them in IndexedDB and
  `App.jsx` flushes on load and on `online`.
- **The coach engine** (`lib/coach.js`) is pure — it takes data in and returns
  a readout. Never call `coachReadout` directly from a component: assemble
  inputs with `loadCoachInputs()` and derive with `readoutFrom()` from
  `lib/coachData.js`, so every screen reads the same signals. The exercise
  library is data in `lib/exercises.js`.
- **Units are metric**, dates are ISO `yyyy-MM-dd` strings via `lib/format.js`
  (`todayISO`, `asDate`) — not `Date` objects in state.
- **Comments explain why, not what.** The existing ones carry real reasoning
  (why an exponent is 3, why a rule was dropped); match that and leave them
  alone unless the reasoning changed.
- **User-facing copy is plain language** — this is for climbers, not doctors.
  The coach never gives an injury-risk number, and says pain is the real
  signal.
- **Ship notes**: add an entry to `src/lib/changelog.js` whenever something
  user-visible changes. It renders as the in-app "What's new".

## Gotchas

- Anything reading the coach's signals must pass the finger/physical tests —
  `loadCoachInputs` does this for you. Skipping them silently rescores
  hangboard sessions off edge size alone.
- The service worker precaches the built assets and updates with a prompt
  (`components/UpdatePrompt.jsx`); `registerType: 'prompt'`, registration
  happens there and nowhere else.
- intervals.icu is optional. Absent credentials is a normal state, never an
  error — features degrade to what the logged sessions alone can show.
