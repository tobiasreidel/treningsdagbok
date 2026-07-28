-- ============================================================================
-- Treningsdagbok - session_streams: shareable chart data for an activity
-- ============================================================================
-- Run in the Supabase SQL editor (after schema.sql and friends.sql). Safe to
-- re-run.
--
-- Charts come from intervals.icu, and only the owner's API key can read their
-- activities - so a friend opening your ride has no way to fetch them. When
-- you open one of your own rides, the app stores a compact copy of the chart
-- data here (src/lib/streams.js), and friends read that copy instead.
--
-- What's stored: the downsampled series (time, distance, altitude, speed, HR,
-- power, cadence), per-stream stats, time-in-zone and laps - roughly 8 KB per
-- activity. The GPS track is deliberately NOT included: a route reveals where
-- you live and ride, which is a bigger step than sharing pace and heart rate.
--
-- Visibility mirrors the session itself: can_view_activities() (friends.sql)
-- already encodes "we're friends AND they haven't turned sharing off", so
-- flipping Settings → Privacy to Private hides these rows too. It's kept in a
-- separate table from sessions on purpose - the dashboard and stats select
-- every session row, and this payload has no business travelling with them.
-- ============================================================================

create table if not exists public.session_streams (
  session_id uuid primary key references public.sessions (id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  data       jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists session_streams_user_idx on public.session_streams (user_id);

alter table public.session_streams enable row level security;

drop policy if exists "own session streams" on public.session_streams;
create policy "own session streams" on public.session_streams
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "friends can view shared session streams" on public.session_streams;
create policy "friends can view shared session streams" on public.session_streams
  for select using (public.can_view_activities(auth.uid(), user_id));
