-- ============================================================================
-- Training coach v4 — finger-test model, bodyweight, and the test battery.
--
-- Run this AFTER supabase/coach.sql. Safe to run more than once.
--
-- WHY THIS EXISTS
-- ---------------
-- v3 stored one finger number, `coach_profile.hang_max_kg`, documented as
-- "Added kg for a 7-10 s two-hand hang". Added weight is the wrong denominator
-- for prescribing intensity: bodyweight is the dominant term, so "85% of max"
-- read as added weight is ~99% of actual tissue load. The app now works in
-- TOTAL load (bodyweight included) on both sides of that ratio.
--
-- `hang_max_kg` is deliberately NOT dropped or rewritten here. Every existing
-- row is added weight - we know this rather than infer it, from the column
-- comment and the two UI labels that wrote it - so the app converts it at read
-- time once a bodyweight exists, and prompts for a retest otherwise. A silent
-- in-place doubling of a training number is not something a migration should
-- do behind someone's back.
--
-- Structure note: each table is created, indexed and RLS-locked in one
-- contiguous block. A statement that fails must never leave a later table
-- created but unprotected.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- coach_profile: bodyweight
-- ---------------------------------------------------------------------------
-- Stored for exactly two purposes: rendering a percentage prescription as
-- kilos ("85% = 71 kg total = take 5 kg off"), and making an old test
-- interpretable. Deliberately a single current value - there is no bodyweight
-- history table and no chart, and that is a decision, not an omission.
-- Climbing has a well-documented problem with disordered eating and RED-S, and
-- a weight trend sitting beside performance metrics in a training app is a
-- known harm vector. A request to add one is not a reason to add one.
alter table if exists public.coach_profile
  add column if not exists bodyweight_kg numeric;

comment on column public.coach_profile.bodyweight_kg is
  'Current bodyweight, kg. Used only to render finger prescriptions in kilos and to interpret tests. No history is kept, by design.';

comment on column public.coach_profile.hang_max_kg is
  'LEGACY: ADDED kg for a 7-10 s two-hand hang. Superseded by finger_tests (total load). Converted at read time using bodyweight_kg.';

-- ---------------------------------------------------------------------------
-- finger_tests
-- ---------------------------------------------------------------------------
-- One row per finger test. Per grip, per protocol, and per hand, because all
-- three change the number and prescribing from a single collapsed value
-- under-loads one grip while over-loading another.
create table if not exists public.finger_tests (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tested_on     date not null default current_date,
  -- 'total_load': most you can hold ~10 s, kg INCLUDING bodyweight.
  -- 'min_edge'  : smallest edge you can hold ~10 s at bodyweight, in mm.
  --               Needs no bodyweight at all, which is why it is supported.
  protocol      text not null default 'total_load'
                  check (protocol in ('total_load', 'min_edge')),
  grip          text not null default 'halfcrimp'
                  check (grip in ('halfcrimp', 'open3', 'open4', 'fullcrimp', 'pinch')),
  edge_mm       smallint,
  hands         text not null default 'two' check (hands in ('two', 'one')),
  -- kg (total_load) or mm (min_edge). For a one-hand test this is the right
  -- hand and value_left the left.
  value         numeric,
  value_left    numeric,
  -- Snapshot, not a reference: a max recorded at a different bodyweight is not
  -- comparable to today's, and the profile value drifts.
  bodyweight_at_test numeric,
  -- A test abandoned because of pain is the most informative entry the battery
  -- can produce. It must never be stored as a blank cell.
  aborted_reason text check (aborted_reason in ('pain', 'skin', 'other')),
  notes         text check (notes is null or char_length(notes) <= 500),
  created_at    timestamptz not null default now()
);

create index if not exists finger_tests_user_date_idx
  on public.finger_tests (user_id, tested_on desc);

alter table public.finger_tests enable row level security;

drop policy if exists "own finger tests" on public.finger_tests;
create policy "own finger tests" on public.finger_tests
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- physical_tests — the wider battery
-- ---------------------------------------------------------------------------
-- Strength, power and mobility tests. `side` carries L/R for bilateral items so
-- an asymmetry can be seen at all; collapsing to one number throws away
-- precisely the comparison worth having.
--
-- `normalised` exists because a raw centimetre value on a limb-length or
-- height dependent test (splits, high step) is not comparable between two
-- athletes or across a growth spurt. Store both.
create table if not exists public.physical_tests (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tested_on     date not null default current_date,
  test_id       text not null,
  value         numeric,
  unit          text,
  normalised    numeric,
  side          text check (side in ('L', 'R')),
  aborted_reason text check (aborted_reason in ('pain', 'skin', 'other')),
  notes         text check (notes is null or char_length(notes) <= 500),
  created_at    timestamptz not null default now()
);

create index if not exists physical_tests_user_date_idx
  on public.physical_tests (user_id, tested_on desc);

alter table public.physical_tests enable row level security;

drop policy if exists "own physical tests" on public.physical_tests;
create policy "own physical tests" on public.physical_tests
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
