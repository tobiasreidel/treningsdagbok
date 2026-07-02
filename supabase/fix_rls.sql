-- ============================================================================
-- Treningsdagbok — RLS hardening for friendships + coach_links
-- ============================================================================
-- Run in the Supabase SQL editor (after friends.sql + coaches.sql).
-- Safe to re-run. (Applied to production 2026-07-02.)
--
-- Closes two holes that let any signed-in user grant themselves access to
-- another user's data by talking to PostgREST directly (bypassing the UI):
--   1. friendships could be INSERTed with status='accepted' (skipping consent),
--      and the *requester* could flip their own request to accepted.
--   2. a coach_links UPDATE only checked the coach column, so a user could
--      insert a self-link and then rewrite `athlete` to any victim.
--
-- Fix: inserts must be pending, only the receiving party can accept, and
-- column-level grants make `status` the only updatable column on both tables.
-- ============================================================================

-- friendships: only pending requests can be created, only the addressee accepts
drop policy if exists "create own requests" on public.friendships;
create policy "create own requests" on public.friendships
  for insert with check (
    requester = auth.uid() and addressee <> auth.uid() and status = 'pending'
  );

drop policy if exists "respond to own friendships" on public.friendships;
create policy "respond to own friendships" on public.friendships
  for update using (auth.uid() = addressee)
  with check (auth.uid() = addressee);

revoke update on public.friendships from authenticated;
grant update (status) on public.friendships to authenticated;

-- coach_links: only pending links can be created, and status is the only
-- column a coach can touch (so athlete can never be rewritten to a victim)
drop policy if exists "athlete creates coach link" on public.coach_links;
create policy "athlete creates coach link" on public.coach_links
  for insert with check (
    athlete = auth.uid() and coach <> auth.uid() and status = 'pending'
  );

revoke update on public.coach_links from authenticated;
grant update (status) on public.coach_links to authenticated;
