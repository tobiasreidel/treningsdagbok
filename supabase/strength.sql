-- ============================================================================
-- Treningsdagbok — Strength training: allow 'strength' as a sport
-- ============================================================================
-- Run once in the Supabase SQL editor (after schema.sql). Safe to re-run.
--
-- Strength sessions reuse the existing `sessions` table; their exercises and
-- finger-training data live in the `extra` JSONB column, so no new tables or
-- columns are needed — only the sport CHECK constraint has to be widened.
--
-- NOTE: every migration that touches this constraint applies the FULL current
-- sport list (not just its own era's), so re-running an older file can never
-- regress sports added later.
-- ============================================================================

alter table public.sessions drop constraint if exists sessions_sport_check;
alter table public.sessions
  add constraint sessions_sport_check
  check (sport in ('cycling', 'running', 'swimming', 'climbing', 'strength', 'finger'));
