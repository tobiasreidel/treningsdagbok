-- ============================================================================
-- Treningsdagbok — Phase 1 schema
-- ============================================================================
-- Run this in the Supabase SQL editor (Dashboard -> SQL Editor -> New query).
-- It is idempotent-ish: safe to re-run, but it will not drop existing data.
--
-- Design notes:
--   * Sport-specific *scalar* fields live in `sessions.extra` (jsonb) so new
--     fields can be added with zero migrations (cycling distance/elevation/HR,
--     climbing grades-worked, intervals.icu ids later, etc.).
--   * The outdoor-climbing *route log* is a real relational table (`routes`)
--     because Phase 2 wants to query it (grade pyramid, send-rate trends).
--   * Multi-user ready from day one: every row is scoped by user_id and locked
--     down with Row Level Security so the public anon key is safe to ship.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- sessions
-- ---------------------------------------------------------------------------
create table if not exists public.sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date        date not null,
  sport       text not null check (sport in ('cycling', 'climbing', 'strength')),
  -- cycling: road | gravel    climbing: bouldering | sport | trad    strength: (none)
  subtype     text,
  -- climbing only: indoor | outdoor
  location    text check (location in ('indoor', 'outdoor')),
  feeling     smallint check (feeling between 1 and 5),   -- weak (1) -> strong (5)
  rpe         smallint check (rpe between 1 and 10),       -- perceived exertion
  duration    integer check (duration >= 0),               -- minutes
  notes       text,
  photo_url   text,                                        -- path in storage bucket
  extra       jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists sessions_user_date_idx
  on public.sessions (user_id, date desc);

-- ---------------------------------------------------------------------------
-- routes (individual climbs logged within an outdoor climbing session)
-- ---------------------------------------------------------------------------
create table if not exists public.routes (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.sessions (id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text,                                        -- optional
  grade       text,                                        -- French grade
  send_type   text check (send_type in ('onsight', 'flash', 'redpoint', 'attempt')),
  attempts    integer check (attempts >= 0),               -- optional
  position    integer not null default 0,                  -- display order
  created_at  timestamptz not null default now()
);

create index if not exists routes_session_idx
  on public.routes (session_id, position);
create index if not exists routes_user_idx
  on public.routes (user_id);

-- ---------------------------------------------------------------------------
-- Row Level Security: each user sees and edits only their own rows
-- ---------------------------------------------------------------------------
alter table public.sessions enable row level security;
alter table public.routes   enable row level security;

drop policy if exists "sessions are private to owner" on public.sessions;
create policy "sessions are private to owner" on public.sessions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "routes are private to owner" on public.routes;
create policy "routes are private to owner" on public.routes
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Storage bucket for session photos (private, owner-scoped)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('session-photos', 'session-photos', false)
on conflict (id) do nothing;

-- Files are stored under a `<user_id>/...` prefix so the policy can check
-- ownership from the object path.
drop policy if exists "own photos read"   on storage.objects;
drop policy if exists "own photos insert" on storage.objects;
drop policy if exists "own photos update" on storage.objects;
drop policy if exists "own photos delete" on storage.objects;

create policy "own photos read" on storage.objects
  for select using (
    bucket_id = 'session-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "own photos insert" on storage.objects
  for insert with check (
    bucket_id = 'session-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "own photos update" on storage.objects
  for update using (
    bucket_id = 'session-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "own photos delete" on storage.objects
  for delete using (
    bucket_id = 'session-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
