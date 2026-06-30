-- ============================================================================
-- Treningsdagbok — add the "2. go" (second-go) route send type
-- ============================================================================
-- Run in the Supabase SQL editor (after schema.sql). Safe to re-run.
--
-- Widens the routes.send_type check constraint to allow 'secondgo'. The
-- original inline check is auto-named routes_send_type_check; we drop it and
-- re-add a named one with the full list. No data is touched.
-- ============================================================================

alter table public.routes drop constraint if exists routes_send_type_check;

alter table public.routes
  add constraint routes_send_type_check
  check (send_type in ('onsight', 'flash', 'redpoint', 'secondgo', 'attempt'));
