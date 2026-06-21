# Treningsdagbok 🚴🧗

A personal training diary for **cycling** and **climbing**, built as an installable
**PWA** (Add to Home Screen on iPhone). React + Vite frontend, Supabase backend.

> **Status: Phase 1** — data model, manual session logging, and the landing
> dashboard (calendar + week table + summary cards). Built multi-user-ready and
> offline-resilient from day one. Phases 2–4 (stats, intervals.icu import,
> friends) are scoped in the build spec but not yet implemented.

---

## What's in Phase 1

- **Email + password auth** (Supabase) — single user now, multi-user ready.
- **Register session** wizard: sport → type/location → details → routes → notes/photo.
  Fast, one-handed, with a step for the outdoor-climbing route log.
- **Dashboard**: month calendar (color-coded), last-week table, and summary cards
  (hours this week/month split by sport, session count, cycling distance/elevation).
- **Edit & delete** any session.
- **Offline-safe**: a session logged with no signal is saved to an on-device
  outbox (IndexedDB) and synced automatically when you're back online.
- **Metric units throughout**, dark mode follows your system setting.

---

## 1. Prerequisites

- Node.js 18+ (`node --version`)
- A free [Supabase](https://supabase.com) account

## 2. Set up Supabase

1. Create a new project at [supabase.com](https://supabase.com) (no credit card needed).
2. In the dashboard, open **SQL Editor → New query**, paste the contents of
   [`supabase/schema.sql`](supabase/schema.sql), and run it. This creates the
   `sessions` and `routes` tables, Row Level Security policies, and the private
   `session-photos` storage bucket.
3. **Auth setting (recommended for a personal app):** go to
   **Authentication → Providers → Email** and turn **off** "Confirm email".
   This lets you create your account and sign in immediately. (If you leave it
   on, you'll get a confirmation email to click once after signing up.)
4. Grab your keys from **Project Settings → API**:
   - Project URL → `VITE_SUPABASE_URL`
   - `anon` `public` key → `VITE_SUPABASE_ANON_KEY`

The anon key is safe to ship in a client app **because** RLS is enabled — every
row is locked to its owner.

## 3. Run locally

```bash
cp .env.example .env      # then paste in your URL + anon key
npm install
npm run dev               # http://localhost:5173
```

On first run, open the app, choose **Create account**, and sign in.

## 4. Build & deploy (Vercel or Netlify)

```bash
npm run build             # outputs to dist/
```

Deploy `dist/` to **Vercel** or **Netlify** (both free). Two things to set:

- **Environment variables**: add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
  in the host's project settings (they're build-time vars).
- **SPA routing**: already handled — [`vercel.json`](vercel.json) and
  [`public/_redirects`](public/_redirects) rewrite all paths to `index.html`.

## 5. Install on your iPhone

Open the deployed URL in **Safari** → Share → **Add to Home Screen**. It launches
full-screen with its own icon, like a native app.

---

## Notes

- **Supabase free-tier pause:** a free project pauses after 7 days with zero API
  requests. Regular use keeps it awake; if you're away for a week, just reopen
  the dashboard to wake it.
- **Offline:** writes never block on the network. If you log at a crag with no
  signal, the session is queued locally and uploaded when you reconnect — you'll
  see an "offline" badge on it until then. (Editing/deleting needs a connection.)
- **Photos** are stored privately per-user; the app fetches short-lived signed
  URLs to display them.

## Regenerating app icons

Icons in `public/` are generated from a script (requires Python + Pillow):

```bash
npm run icons
```

## Project structure

```
src/
  lib/         supabase client, data access, offline outbox, formatting, constants
  context/     AuthContext (email/password session)
  components/  UI controls, dashboard widgets (Calendar, SummaryCards, WeekTable)
    form/      shared session-form sections (details, routes, notes/photo)
  pages/       Dashboard, RegisterSession (wizard), EditSession
supabase/
  schema.sql   tables + RLS + storage bucket
scripts/
  generate_icons.py
```

## Data model (quick reference)

- `sessions`: `date, sport, subtype, location, feeling (1–5), rpe (1–10),
  duration (min), notes, photo_url`, plus an **`extra` JSONB** column for
  sport-specific fields (cycling: distance/elevation/speed/HR/power; climbing:
  grades worked). New fields can be added with zero migrations.
- `routes`: the outdoor-climbing route log — one row per climb
  (`name, grade, send_type, attempts`), linked to a session.

---

## Roadmap (from the spec)

- **Phase 2** — Stats & dashboards (climbing-first: discipline split, grade
  pyramid, send-rate; cycling distance/elevation/load; streaks & trends).
- **Phase 3** — Automatic cycling import via [intervals.icu](https://intervals.icu)
  (free API), pre-filling objective fields and avoiding duplicates.
- **Phase 4** — Friends: connections, shared feed/leaderboard, privacy controls.
```
