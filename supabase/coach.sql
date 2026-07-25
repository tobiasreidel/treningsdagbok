-- ============================================================================
-- Treningsdagbok - training coach: athlete profile, goals, wellness, overuse
-- ============================================================================
-- Run in the Supabase SQL editor (after schema.sql and health.sql).
-- Safe to re-run: every statement is idempotent.
--
--   * coach_profile  - what the session generator needs to prescribe real
--     numbers instead of generic advice: grades per context, how often you
--     train, what you have access to, finger-strength baseline, injury history.
--   * coach_goals    - what you're training toward and when. A goal with a date
--     turns a weekly rhythm into a plan that peaks on time.
--   * wellness_days  - one row per calendar day, logged whether or not you
--     trained. This is the whole point: wellness attached to sessions is only
--     sampled on days you trained, and people skip sessions when they feel
--     wrecked, so the days a readiness score most needs are the days it would
--     have no data for.
--   * ostrc_reports  - the weekly OSTRC Overuse Injury Questionnaire, so the
--     coach can react to a problem that is developing rather than one already
--     declared as an injury.
--
-- Every table is strictly private to its owner: no friend or coach policy ever
-- references any of them.
--
-- Structure note: each table is created, altered, indexed and locked down with
-- RLS in one contiguous block. A statement that fails must never leave a later
-- table created but unprotected.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- coach_profile
-- ---------------------------------------------------------------------------
create table if not exists public.coach_profile (
  user_id         uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  birth_year      integer check (birth_year between 1900 and 2100),
  climbing_since  integer check (climbing_since between 1900 and 2100),
  -- Headline grades, kept as the fallback the app derives from the
  -- context-specific ones below.
  max_boulder     text,
  max_route       text,
  flash_boulder   text,
  onsight_route   text,
  sessions_week   smallint check (sessions_week between 1 and 14),
  has_hangboard   boolean not null default false,
  has_campus      boolean not null default false,
  has_spraywall   boolean not null default false,
  has_gym         boolean not null default false,
  -- Added kg for a 7-10 s two-hand hang on `hang_edge_mm`.
  hang_max_kg     numeric,
  hang_edge_mm    smallint,
  -- Free text, deliberately: injury history is messy and a checkbox list would
  -- lose the part that matters.
  injury_history  text check (injury_history is null or char_length(injury_history) <= 2000),
  focus           text check (focus in ('boulder', 'route', 'both')),
  updated_at      timestamptz not null default now()
);

-- Grades by context. "8B" on a Moonboard, on commercial set boulders and
-- outdoors are three different things - board grades in particular run stiff -
-- so each is stored separately and the coach quotes whichever matches the
-- session it just suggested.
alter table public.coach_profile
  add column if not exists max_boulder_outdoor text,
  add column if not exists max_boulder_indoor  text,
  add column if not exists max_boulder_board   text,
  add column if not exists max_route_outdoor   text,
  add column if not exists max_route_indoor    text,
  add column if not exists board_type text
    check (board_type is null or board_type in ('kilter', 'moon', 'tension', 'spray', 'other')),
  -- When hang_max_kg was last tested. Prescribing "80-90% of your max" off an
  -- eight-month-old number is prescribing a number nobody knows.
  add column if not exists hang_tested_on date,
  -- ISO weekdays (1 = Mon .. 7 = Sun) you normally train. Without this the plan
  -- can order sessions but not space them, and hard/easy alternation is
  -- meaningless for someone training Fri/Sat/Sun.
  add column if not exists preferred_days smallint[];

alter table public.coach_profile enable row level security;

drop policy if exists "coach profile is private to owner" on public.coach_profile;
create policy "coach profile is private to owner" on public.coach_profile
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- coach_goals
-- ---------------------------------------------------------------------------
create table if not exists public.coach_goals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 120),
  -- A competition or trip is a hard date to peak for; a grade or strength goal
  -- is open-ended and shapes the emphasis instead.
  kind        text not null check (kind in ('competition', 'grade', 'strength', 'trip', 'other')),
  target_date date,
  grade       text,
  notes       text check (notes is null or char_length(notes) <= 1000),
  achieved    boolean not null default false,
  created_at  timestamptz not null default now()
);

-- A rope competition and a bouldering competition are trained for completely
-- differently - endurance and pump tolerance versus max recruitment and power -
-- so the countdown has to know which. 'both' means a combined event, and the
-- plan alternates disciplines through the week for it.
--
-- Comp climbing and outdoor climbing are likewise different sports wearing the
-- same shoes: a competition is unseen climbing against a clock, outdoor is the
-- same moves for weeks on small holds. Peaking for one does not peak you for
-- the other. (Speed is not modelled.)
alter table public.coach_goals
  add column if not exists discipline text
    check (discipline is null or discipline in ('boulder', 'rope', 'both')),
  add column if not exists style text
    check (style is null or style in ('comp', 'outdoor'));

create index if not exists coach_goals_user_idx
  on public.coach_goals (user_id, target_date);

alter table public.coach_goals enable row level security;

drop policy if exists "coach goals are private to owner" on public.coach_goals;
create policy "coach goals are private to owner" on public.coach_goals
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- wellness_days - the Hooper index, logged daily and independently of training
-- ---------------------------------------------------------------------------
create table if not exists public.wellness_days (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date       date not null,
  sleep      smallint check (sleep between 1 and 5),      -- 5 = slept great
  fatigue    smallint check (fatigue between 1 and 5),    -- 5 = exhausted
  soreness   smallint check (soreness between 1 and 5),   -- 5 = very sore
  stress     smallint check (stress between 1 and 5),     -- 5 = very stressed
  note       text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now(),
  -- The app upserts on (user_id, date); this primary key is what makes that
  -- conflict target valid.
  primary key (user_id, date)
);

alter table public.wellness_days enable row level security;

drop policy if exists "wellness days are private to owner" on public.wellness_days;
create policy "wellness days are private to owner" on public.wellness_days
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- ostrc_reports - weekly OSTRC Overuse Injury Questionnaire (OSTRC-O)
--
-- A validated 4-item instrument from the Oslo Sports Trauma Research Centre,
-- built because time-loss injury definitions massively under-count overuse
-- problems. Each item scores 0/8/17/25 or 0/6/13/25; the sum is a 0-100
-- severity score for the week. The scores are the instrument's, not ours.
-- ---------------------------------------------------------------------------
create table if not exists public.ostrc_reports (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  week_start date not null,                       -- Monday of the week reported
  area       text not null check (area in ('fingers', 'elbow', 'shoulder', 'wrist', 'knee', 'back', 'other')),
  q1         smallint not null check (q1 in (0, 8, 17, 25)),  -- participation
  q2         smallint not null check (q2 in (0, 6, 13, 25)),  -- training volume
  q3         smallint not null check (q3 in (0, 6, 13, 25)),  -- performance
  q4         smallint not null check (q4 in (0, 6, 13, 25)),  -- pain
  created_at timestamptz not null default now(),
  -- The app upserts on these three; this constraint is the conflict target.
  unique (user_id, week_start, area)
);

create index if not exists ostrc_user_idx on public.ostrc_reports (user_id, week_start desc);

alter table public.ostrc_reports enable row level security;

drop policy if exists "ostrc reports are private to owner" on public.ostrc_reports;
create policy "ostrc reports are private to owner" on public.ostrc_reports
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- injuries gain a body region (the table itself lives in supabase/health.sql).
--
-- Without a region the coach can't route around the affected structure - and
-- prescribing antagonist work, which is mostly shoulder and push, is the worst
-- possible answer to a shoulder injury.
--
-- Guarded and placed last on purpose: if health.sql hasn't been run, this must
-- skip quietly rather than abort the script and leave the tables above created
-- but without their row-level security applied.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'injuries'
  ) then
    alter table public.injuries
      add column if not exists region text
        check (region is null or region in ('fingers', 'elbow', 'shoulder', 'wrist', 'knee', 'back', 'other'));
  else
    raise notice 'Skipping injuries.region - run supabase/health.sql first, then re-run this file.';
  end if;
end $$;
