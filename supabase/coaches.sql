-- ============================================================================
-- Treningsdagbok — Phase 5: coaches (read-only full account access)
-- ============================================================================
-- Run in the Supabase SQL editor (after schema.sql + friends.sql).
-- Safe to re-run.
--
-- Model:
--   * coach_links — an athlete grants a coach read access to their whole
--     account. The athlete sends the request (athlete = auth.uid()); the coach
--     accepts. Once accepted the coach can SELECT all of the athlete's
--     sessions / routes / photos — but no write policy ever references them,
--     so coaching is strictly read-only.
--   * Unlike the friends feed, coach access ignores the share_activities
--     privacy toggle: it is a deliberate, per-person grant.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. table
-- ---------------------------------------------------------------------------
create table if not exists public.coach_links (
  id         uuid primary key default gen_random_uuid(),
  athlete    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  coach      uuid not null references auth.users (id) on delete cascade,
  status     text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  unique (athlete, coach)
);
create index if not exists coach_links_coach_idx on public.coach_links (coach);

alter table public.coach_links enable row level security;

-- ---------------------------------------------------------------------------
-- 2. coach_links policies
-- ---------------------------------------------------------------------------
drop policy if exists "see own coach links" on public.coach_links;
create policy "see own coach links" on public.coach_links
  for select using (auth.uid() in (athlete, coach));

-- only the athlete creates a link (they are sharing their own data)
drop policy if exists "athlete creates coach link" on public.coach_links;
create policy "athlete creates coach link" on public.coach_links
  for insert with check (athlete = auth.uid());

-- only the coach can accept (flip pending -> accepted)
drop policy if exists "coach accepts coach link" on public.coach_links;
create policy "coach accepts coach link" on public.coach_links
  for update using (coach = auth.uid()) with check (coach = auth.uid());

-- either party can remove the link (athlete revokes, or coach resigns)
drop policy if exists "either party deletes coach link" on public.coach_links;
create policy "either party deletes coach link" on public.coach_links
  for delete using (auth.uid() in (athlete, coach));

-- ---------------------------------------------------------------------------
-- 3. visibility: can `viewer` read `owner`'s data as an accepted coach?
--    SECURITY DEFINER so it can read coach_links past its own RLS.
-- ---------------------------------------------------------------------------
create or replace function public.can_coach_view(viewer uuid, owner uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.coach_links cl
    where cl.coach = viewer and cl.athlete = owner and cl.status = 'accepted'
  );
$$;
grant execute on function public.can_coach_view(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. read-only access for accepted coaches (SELECT only — no write policy)
-- ---------------------------------------------------------------------------
drop policy if exists "coaches can view athlete sessions" on public.sessions;
create policy "coaches can view athlete sessions" on public.sessions
  for select using (public.can_coach_view(auth.uid(), user_id));

drop policy if exists "coaches can view athlete routes" on public.routes;
create policy "coaches can view athlete routes" on public.routes
  for select using (public.can_coach_view(auth.uid(), user_id));

-- coach + athlete can see each other's profile (display names)
drop policy if exists "profiles visible to coach links" on public.profiles;
create policy "profiles visible to coach links" on public.profiles
  for select using (
    exists (
      select 1 from public.coach_links cl
      where (cl.athlete = auth.uid() and cl.coach = profiles.id)
         or (cl.coach = auth.uid() and cl.athlete = profiles.id)
    )
  );

-- coaches can read the athlete's session photos (stored under <athlete_id>/...).
-- Compared as text (no uuid cast) so an odd object name can never error the
-- policy; coach_links RLS already lets the coach see their own accepted links.
drop policy if exists "coaches read athlete photos" on storage.objects;
create policy "coaches read athlete photos" on storage.objects
  for select using (
    bucket_id = 'session-photos'
    and exists (
      select 1 from public.coach_links cl
      where cl.coach = auth.uid()
        and cl.status = 'accepted'
        and cl.athlete::text = (storage.foldername(name))[1]
    )
  );

-- ---------------------------------------------------------------------------
-- 5. send a coaching request by the coach's email
--    returns: 'ok' | 'not_found' | 'self' | 'exists'
-- ---------------------------------------------------------------------------
create or replace function public.send_coach_request(coach_email text)
returns text language plpgsql security definer set search_path = public as $$
declare target uuid;
begin
  select id into target from auth.users where lower(email) = lower(trim(coach_email));
  if target is null then return 'not_found'; end if;
  if target = auth.uid() then return 'self'; end if;
  if exists (
    select 1 from public.coach_links cl
    where cl.athlete = auth.uid() and cl.coach = target
  ) then
    return 'exists';
  end if;
  insert into public.coach_links (athlete, coach, status)
  values (auth.uid(), target, 'pending');
  return 'ok';
end $$;
grant execute on function public.send_coach_request(text) to authenticated;
