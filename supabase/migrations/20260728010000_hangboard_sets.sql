-- ============================================================================
-- hangboard_sets: the app's most important numbers, out of the JSON blob.
--
-- Run after 20260727000000_coach_v4.sql. Safe to re-run.
--
-- WHY
-- ---
-- `sessions.extra.finger.hangboard[].sets[]` is structured, versioned,
-- queryable data that has been living in an untyped blob since it was small
-- enough not to matter. It is now what the finger-load model, the recovery
-- window and the progression chart are all computed from, and three shipped
-- bugs came from consumers reading that blob differently.
--
-- A real table gives types, constraints, and "every half-crimp set at 20 mm
-- this athlete has done" as a query rather than a client-side loop over every
-- session ever logged.
--
-- MIGRATION SHAPE, ON PURPOSE
-- ---------------------------
-- `extra` remains the source of truth for now and this table is written
-- alongside it. Nothing reads from here yet. That is deliberate: switching the
-- read path in the same change that introduces the table would mean a bug in
-- either one silently loses training data, and the one thing this app must not
-- do is lose a logged session. The backfill below fills history from `extra`,
-- and the read path moves over once the two have been compared on real data.
--
-- LOAD IS TOTAL KILOS, bodyweight included, matching finger_tests. A legacy
-- added-weight row that has no bodyweight to convert with is stored as NULL
-- rather than guessed at (see src/lib/sessionShape.js).
-- ============================================================================

create table if not exists public.hangboard_sets (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_id    uuid not null references public.sessions (id) on delete cascade,
  -- Position within the session, so a session's sets keep their order without
  -- depending on insertion order.
  block_index   smallint not null default 0,
  set_index     smallint not null default 0,
  hands         text not null default 'two' check (hands in ('two', 'one')),
  grip          text not null default 'halfcrimp'
                  check (grip in ('halfcrimp', 'open3', 'open4', 'fullcrimp', 'pinch')),
  -- Total load through the fingers, bodyweight included. NULL when the row came
  -- from a legacy added-weight set with no bodyweight to read it with.
  load_total_kg numeric,
  seconds       numeric check (seconds is null or seconds >= 0),
  reps          smallint not null default 1 check (reps >= 1),
  edge_mm       smallint check (edge_mm is null or edge_mm > 0),
  rest_s        numeric check (rest_s is null or rest_s >= 0),
  -- The session's own date, copied so the common query (sets over time) needs
  -- no join. Kept in step by the writer, not by a trigger.
  performed_on  date not null,
  created_at    timestamptz not null default now(),
  unique (session_id, block_index, set_index)
);

create index if not exists hangboard_sets_user_date_idx
  on public.hangboard_sets (user_id, performed_on desc);
create index if not exists hangboard_sets_grip_idx
  on public.hangboard_sets (user_id, grip, edge_mm);

alter table public.hangboard_sets enable row level security;

drop policy if exists "own hangboard sets" on public.hangboard_sets;
create policy "own hangboard sets" on public.hangboard_sets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- A coach with accepted access reads sessions already, so sets are no wider a
-- grant than what they can see today. Select only: no write policy references
-- the coach, so this can never become a write path.
do $$
begin
  if exists (
    select 1 from pg_proc where proname = 'can_coach_view'
  ) then
    drop policy if exists "coach reads hangboard sets" on public.hangboard_sets;
    create policy "coach reads hangboard sets" on public.hangboard_sets
      for select using (public.can_coach_view(auth.uid(), user_id));
  else
    raise notice 'Skipping the coach policy: run 20260101000900_coaches.sql first, then re-run this file.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- backfill from extra
-- ---------------------------------------------------------------------------
-- Reads the same shapes src/lib/sessionShape.js reads:
--   v4     sets[].load_total_kg  (total kilos)
--   legacy sets[].weight         (ADDED kilos, needs a bodyweight)
--   v1     a flat { hands, weight } with no sets array
--
-- Idempotent through the unique key, so re-running adds only what is missing.
insert into public.hangboard_sets (
  user_id, session_id, block_index, set_index, hands, grip,
  load_total_kg, seconds, reps, edge_mm, rest_s, performed_on
)
select
  s.user_id,
  s.id,
  (blk.ord - 1)::smallint,
  (st.ord - 1)::smallint,
  coalesce(blk.value ->> 'hands', 'two'),
  coalesce(blk.value ->> 'grip', 'halfcrimp'),
  case
    when nullif(st.value ->> 'load_total_kg', '') is not null
      then (st.value ->> 'load_total_kg')::numeric
    when nullif(st.value ->> 'weight', '') is not null and p.bodyweight_kg is not null
      then p.bodyweight_kg + (st.value ->> 'weight')::numeric
    else null
  end,
  nullif(st.value ->> 'time', '')::numeric,
  greatest(1, coalesce(nullif(blk.value ->> 'reps', '')::numeric, 1))::smallint,
  nullif(st.value ->> 'edge', '')::smallint,
  nullif(blk.value ->> 'rest', '')::numeric,
  s.date
from public.sessions s
  left join public.coach_profile p on p.user_id = s.user_id
  cross join lateral jsonb_array_elements(
    case jsonb_typeof(s.extra -> 'finger' -> 'hangboard')
      when 'array' then s.extra -> 'finger' -> 'hangboard'
      else '[]'::jsonb
    end
  ) with ordinality as blk(value, ord)
  cross join lateral jsonb_array_elements(
    case jsonb_typeof(blk.value -> 'sets')
      when 'array' then blk.value -> 'sets'
      -- v1 rows have no sets array: the block itself is one set.
      else jsonb_build_array(blk.value)
    end
  ) with ordinality as st(value, ord)
on conflict (session_id, block_index, set_index) do nothing;
