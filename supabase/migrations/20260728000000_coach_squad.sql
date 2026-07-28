-- ============================================================================
-- Squad view: athlete-granted, signal-only coach access + the OSTRC roll-up.
--
-- Run after supabase/coach.sql and supabase/migrations/20260101000900_coaches.sql. Safe to re-run.
--
-- WHY THIS IS NOT "the coach sees everything"
-- -------------------------------------------
-- The obvious design is a coach role with read access to the athlete's whole
-- account, which is what coach_links already grants for sessions. That is the
-- wrong shape for health data. A sixteen-year-old who knows their coach reads
-- the stress field stops filling in the stress field, and then readiness stops
-- working for exactly the athletes it matters most for.
--
-- So this migration grants two things and nothing else:
--
--   1. `coach_signal_snapshots` - DERIVED numbers only. The athlete's own device
--      computes the readout it already computes and writes a daily row: a
--      readiness index, a finger-recovery state, hard-day counts. The raw daily
--      wellness items (sleep, fatigue, soreness, stress) and their free-text
--      note never leave the athlete's account.
--   2. `ostrc_reports` - the weekly overuse questionnaire, which is a validated
--      instrument designed for exactly this kind of squad-level surveillance and
--      carries no free text at all.
--
-- Both are gated on `coach_links.shares_signals`, which the athlete sets per
-- coach and can withdraw at any time. It defaults to FALSE, so running this
-- migration grants nobody anything until an athlete says so.
--
-- What is deliberately NOT here, and must not be added later without the same
-- deliberation: wellness_days (the note field and the raw items), and any
-- cross-athlete comparison of finger strength, hang loads or grades. A roster
-- sorted by max hang, among teenagers, in a sport with a documented RED-S
-- problem, is the bodyweight chart again through a different door.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. the grant
-- ---------------------------------------------------------------------------
alter table if exists public.coach_links
  add column if not exists shares_signals boolean not null default false;

comment on column public.coach_links.shares_signals is
  'Athlete-granted, revocable: lets this coach read derived signal snapshots and OSTRC reports. Never the raw wellness items or their note.';

-- Can `viewer` read `owner`'s health signals? Accepted link AND the athlete
-- has opted in. SECURITY DEFINER so it can read coach_links past its own RLS.
create or replace function public.can_coach_view_signals(viewer uuid, owner uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.coach_links l
    where l.coach = viewer
      and l.athlete = owner
      and l.status = 'accepted'
      and l.shares_signals
  );
$$;

-- ---------------------------------------------------------------------------
-- 2. coach_signal_snapshots
-- ---------------------------------------------------------------------------
-- One row per athlete per day, written by the athlete's own client from the
-- readout it has already computed. Derived values only: nothing here can be
-- turned back into what the athlete typed.
create table if not exists public.coach_signal_snapshots (
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date             date not null,
  readiness_index  smallint check (readiness_index between 0 and 100),
  readiness_label  text,
  finger_state     text,
  finger_days_7    smallint,
  finger_days_28   smallint,
  chronic_level    text,
  sustained_weeks  smallint,
  -- Whether the athlete checked in today, so a coach can see "no data" rather
  -- than reading a stale number as current.
  checked_in       boolean not null default false,
  updated_at       timestamptz not null default now(),
  primary key (user_id, date)
);

create index if not exists coach_signal_snapshots_date_idx
  on public.coach_signal_snapshots (date desc);

alter table public.coach_signal_snapshots enable row level security;

drop policy if exists "own signal snapshots" on public.coach_signal_snapshots;
create policy "own signal snapshots" on public.coach_signal_snapshots
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Read-only for a coach the athlete has opted in for. No insert/update/delete
-- policy references the coach, so this can never become a write path.
drop policy if exists "coach reads shared snapshots" on public.coach_signal_snapshots;
create policy "coach reads shared snapshots" on public.coach_signal_snapshots
  for select using (public.can_coach_view_signals(auth.uid(), user_id));

-- ---------------------------------------------------------------------------
-- 3. OSTRC for an opted-in coach
-- ---------------------------------------------------------------------------
-- The existing "own ostrc" policy stays exactly as it is; this is an additional
-- select-only policy alongside it.
drop policy if exists "coach reads shared ostrc" on public.ostrc_reports;
create policy "coach reads shared ostrc" on public.ostrc_reports
  for select using (public.can_coach_view_signals(auth.uid(), user_id));
