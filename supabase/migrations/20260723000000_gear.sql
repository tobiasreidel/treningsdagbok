-- ============================================================================
-- Treningsdagbok - gear: equipment items + wear & maintenance log
-- ============================================================================
-- Run in the Supabase SQL editor (after schema.sql). Safe to re-run, and
-- upgrades an earlier gear.sql install in place.
--
--   * gear_items  - the equipment itself: a bike, a pair of climbing or
--     running shoes. One per sport is the "main" one - sessions that don't
--     say otherwise are assumed to be on it.
--   * gear_events - maintenance/wear events on an item: "oiled the chain",
--     "new front tire", "resoled" - a label and a date. The profile page
--     turns these into a wear table client-side (src/lib/gear.js): km or
--     sessions since the latest event per label.
--
-- Strictly private to the owner - no friend or coach policy references this.
-- ============================================================================

create table if not exists public.gear_items (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  sport      text not null check (sport in ('cycling', 'running', 'climbing')),
  name       text not null check (char_length(name) between 1 and 60),
  is_main    boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists gear_items_user_idx on public.gear_items (user_id, sport);

alter table public.gear_items enable row level security;

drop policy if exists "gear items are private to owner" on public.gear_items;
create policy "gear items are private to owner" on public.gear_items
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.gear_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  sport      text not null check (sport in ('cycling', 'running', 'climbing')),
  label      text not null check (char_length(label) between 1 and 100),
  date       date not null,
  item_id    uuid references public.gear_items (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Upgrade path: the first gear.sql shipped without items. Events from that
-- version have item_id null and are attributed to the sport's main item.
alter table public.gear_events
  add column if not exists item_id uuid references public.gear_items (id) on delete cascade;

create index if not exists gear_events_user_idx on public.gear_events (user_id, sport, date desc);

alter table public.gear_events enable row level security;

drop policy if exists "gear events are private to owner" on public.gear_events;
create policy "gear events are private to owner" on public.gear_events
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
