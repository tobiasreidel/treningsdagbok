-- ============================================================================
-- Training coach v5: the intake a real coach would take, and a block start.
--
-- Safe to re-run. Every statement is idempotent and the table's RLS policy
-- (coach_profile is private to its owner) already covers the new columns.
--
-- WHY THESE FOUR COLUMNS
-- ----------------------
-- The plan used to be built from grades, frequency and facilities alone, and
-- it showed: the same 90-minute session for someone with 45 minutes, the same
-- filler for a climber who knows their endurance is the problem, and a "stays
-- conservative with injury history" promise in the setup copy that nothing in
-- the engine actually read (the history was free text). Each column below is
-- something the engine now acts on, not just stores.
--
--   session_minutes   how long a session can be. The session sheet is built to
--                     fit it (warm-up, main, extras, finisher) and says what it
--                     cut when it cannot. Plans that assume two and a half hours
--                     are plans people skip.
--   weaknesses        what the athlete thinks holds them back. Spends the spare
--                     slot in the week on it and orders the alternatives.
--   injury_regions    structured injury history, alongside the free text. With
--                     finger history the chronic hard-day ceiling drops a step
--                     and hangs are prescribed at the low half of their range.
--   plan_started_on   the Monday the current training block started. The 4-week
--                     cycle used to count from the first session ever logged,
--                     which could drop a brand-new user straight into a deload
--                     week. "Start a new block" sets it.
-- ============================================================================

alter table if exists public.coach_profile
  add column if not exists session_minutes smallint
    check (session_minutes is null or session_minutes between 20 and 300),
  add column if not exists weaknesses text[],
  add column if not exists injury_regions text[],
  add column if not exists plan_started_on date;

comment on column public.coach_profile.session_minutes is
  'Typical time available per session, minutes. The session sheet is built to fit it.';
comment on column public.coach_profile.weaknesses is
  'Self-assessed weaknesses (fingers, power, endurance, technique, strength, mobility, mental). Bias the plan, never gate it.';
comment on column public.coach_profile.injury_regions is
  'Structured injury history by body area, so the engine can be conservative where the free text could only be read by a person.';
comment on column public.coach_profile.plan_started_on is
  'Monday of the week the current 4-week block started. Null falls back to the first logged session.';
