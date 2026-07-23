-- ============================================================================
-- Treningsdagbok - gear: equipment wear & maintenance log
-- ============================================================================
-- Run in the Supabase SQL editor (after schema.sql). Safe to re-run.
--
-- One row per gear event: "oiled the chain", "new front tire", "resoled
-- shoes" - a sport, a label and a date. The profile page turns these into a
-- wear table client-side (src/lib/gear.js): distance ridden/run since the
-- latest event per label, or climbing sessions since.
--
-- Strictly private to the owner - no friend or coach policy references this.
-- ============================================================================

create table if not exists public.gear_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  sport      text not null check (sport in ('cycling', 'running', 'climbing')),
  label      text not null check (char_length(label) between 1 and 100),
  date       date not null,
  created_at timestamptz not null default now()
);

create index if not exists gear_events_user_idx on public.gear_events (user_id, sport, date desc);

alter table public.gear_events enable row level security;

drop policy if exists "gear events are private to owner" on public.gear_events;
create policy "gear events are private to owner" on public.gear_events
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
