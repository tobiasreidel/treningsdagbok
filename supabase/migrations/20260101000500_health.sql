-- ============================================================================
-- Treningsdagbok - health: period tracking + injury log
-- ============================================================================
-- Run in the Supabase SQL editor (after schema.sql). Safe to re-run.
--
-- Both tables are STRICTLY private to their owner: no friend or coach policy
-- ever references them, so nothing here is visible to anyone else regardless
-- of sharing settings.
--
--   * period_days - one row per marked calendar day. Cycle prediction is done
--     client-side from these dates (src/lib/health.js).
--   * injuries    - a note + start date; `ended` stays null while the injury
--     is active and is set when the user marks it healed.
-- ============================================================================

create table if not exists public.period_days (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date       date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, date)
);

alter table public.period_days enable row level security;

drop policy if exists "period days are private to owner" on public.period_days;
create policy "period days are private to owner" on public.period_days
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.injuries (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  note       text not null check (char_length(note) between 1 and 500),
  started    date not null,
  ended      date,                                   -- null = still injured
  created_at timestamptz not null default now()
);

create index if not exists injuries_user_idx on public.injuries (user_id, started desc);

alter table public.injuries enable row level security;

drop policy if exists "injuries are private to owner" on public.injuries;
create policy "injuries are private to owner" on public.injuries
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
