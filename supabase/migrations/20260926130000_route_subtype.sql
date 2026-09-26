-- ============================================================================
-- Treningsdagbok - a route or boulder says which discipline it was
-- ============================================================================
-- Safe to re-run.
--
-- A climbing session can now be more than one discipline (bouldering, then
-- some routes). The session's own `subtype` is the first one picked, and
-- `extra.disciplines` lists them all. A logged climb in such a session needs to
-- say which it was, because that decides its grade scale: 6C and 6c are
-- different grades. Null keeps meaning "the session's subtype", so every
-- existing row reads exactly as before.
--
-- The routes table already has its RLS (20260101000000_schema.sql); a new
-- column is covered by the existing policies.
-- ============================================================================

alter table if exists public.routes
  add column if not exists subtype text
    check (subtype is null or subtype in ('bouldering', 'sport', 'trad'));
