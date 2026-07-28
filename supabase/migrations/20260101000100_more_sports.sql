-- ============================================================================
-- Treningsdagbok - add running + swimming as sports
-- ============================================================================
-- Run in the Supabase SQL editor (after schema.sql). Safe to re-run.
--
-- Widens the sessions.sport check constraint to allow the two new sports.
-- The original inline check is auto-named sessions_sport_check; we drop it and
-- re-add a named one with the full list. No data is touched.
--
-- NOTE: applies the FULL current sport list so a re-run after finger.sql can
-- never regress the constraint.
-- ============================================================================

alter table public.sessions drop constraint if exists sessions_sport_check;

alter table public.sessions
  add constraint sessions_sport_check
  check (sport in ('cycling', 'running', 'swimming', 'climbing', 'strength', 'finger'));
