-- ============================================================================
-- Treningsdagbok - split finger training into its own sport
-- ============================================================================
-- Run in the Supabase SQL editor (after more_sports.sql). Safe to re-run.
--
-- Adds 'finger' to the allowed sports. Finger work (campus + hangboard) used to
-- ride inside a strength session; it is now a first-class sport that can be
-- logged on its own or carved out of an indoor climb (extra.finger_minutes).
-- No existing rows are touched - old strength sessions keep their finger data.
-- ============================================================================

alter table public.sessions drop constraint if exists sessions_sport_check;

alter table public.sessions
  add constraint sessions_sport_check
  check (sport in ('cycling', 'running', 'swimming', 'climbing', 'strength', 'finger'));
