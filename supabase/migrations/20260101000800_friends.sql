-- ============================================================================
-- Treningsdagbok - Phase 4: friends, shared feed/leaderboard, privacy
-- ============================================================================
-- Run in the Supabase SQL editor (after schema.sql + intervals.sql).
-- Safe to re-run.
--
-- Model:
--   * profiles      - public-ish display name/email per user (auth.users isn't
--                     queryable from the client), auto-created on signup.
--   * friendships   - a request row (requester → addressee) that becomes
--                     'accepted'. Friendship is symmetric once accepted.
--   * privacy       - user_settings.share_activities toggles whether accepted
--                     friends can see your sessions. Default on; only ever
--                     visible to *accepted* friends, never strangers.
--
-- NOTE: tables are created first, then policies - a policy that references
-- another table (profiles → friendships) needs that table to already exist.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. tables
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  email        text,
  created_at   timestamptz not null default now()
);

create table if not exists public.friendships (
  id         uuid primary key default gen_random_uuid(),
  requester  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  addressee  uuid not null references auth.users (id) on delete cascade,
  status     text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  unique (requester, addressee)
);
create index if not exists friendships_addressee_idx on public.friendships (addressee);

alter table public.profiles    enable row level security;
alter table public.friendships enable row level security;

-- ---------------------------------------------------------------------------
-- 2. friendships policies
-- ---------------------------------------------------------------------------
drop policy if exists "see own friendships" on public.friendships;
create policy "see own friendships" on public.friendships
  for select using (auth.uid() in (requester, addressee));

drop policy if exists "create own requests" on public.friendships;
create policy "create own requests" on public.friendships
  for insert with check (requester = auth.uid());

drop policy if exists "respond to own friendships" on public.friendships;
create policy "respond to own friendships" on public.friendships
  for update using (auth.uid() in (requester, addressee))
  with check (auth.uid() in (requester, addressee));

drop policy if exists "delete own friendships" on public.friendships;
create policy "delete own friendships" on public.friendships
  for delete using (auth.uid() in (requester, addressee));

-- ---------------------------------------------------------------------------
-- 3. profiles policies (these reference friendships, so it must already exist)
-- ---------------------------------------------------------------------------
-- See your own profile, and profiles of anyone you share a friendship row with
-- (pending or accepted) so request/friend lists can show names.
drop policy if exists "profiles visible to self and connections" on public.profiles;
create policy "profiles visible to self and connections" on public.profiles
  for select using (
    id = auth.uid()
    or exists (
      select 1 from public.friendships f
      where (f.requester = auth.uid() and f.addressee = profiles.id)
         or (f.addressee = auth.uid() and f.requester = profiles.id)
    )
  );

drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "insert own profile" on public.profiles;
create policy "insert own profile" on public.profiles
  for insert with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- 4. profile auto-create on signup + backfill existing users
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, split_part(new.email, '@', 1))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

insert into public.profiles (id, email, display_name)
select id, email, split_part(email, '@', 1) from auth.users
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 5. privacy toggle
-- ---------------------------------------------------------------------------
alter table public.user_settings
  add column if not exists share_activities boolean not null default true;

-- ---------------------------------------------------------------------------
-- 6. visibility: can `viewer` see `owner`'s activities?
-- SECURITY DEFINER so it can read friendships + settings past their RLS.
-- ---------------------------------------------------------------------------
create or replace function public.can_view_activities(viewer uuid, owner uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester = viewer and f.addressee = owner)
        or (f.requester = owner and f.addressee = viewer))
  )
  and coalesce((select share_activities from public.user_settings where user_id = owner), true);
$$;

-- Friends can SELECT shared sessions/routes (added alongside the owner policy).
drop policy if exists "friends can view shared sessions" on public.sessions;
create policy "friends can view shared sessions" on public.sessions
  for select using (public.can_view_activities(auth.uid(), user_id));

drop policy if exists "friends can view shared routes" on public.routes;
create policy "friends can view shared routes" on public.routes
  for select using (public.can_view_activities(auth.uid(), user_id));

-- ---------------------------------------------------------------------------
-- 7. send a friend request by email (looks up auth.users → definer)
-- returns: 'ok' | 'not_found' | 'self' | 'exists'
-- ---------------------------------------------------------------------------
create or replace function public.send_friend_request(target_email text)
returns text language plpgsql security definer set search_path = public as $$
declare target uuid;
begin
  select id into target from auth.users where lower(email) = lower(trim(target_email));
  if target is null then return 'not_found'; end if;
  if target = auth.uid() then return 'self'; end if;
  if exists (
    select 1 from public.friendships f
    where (f.requester = auth.uid() and f.addressee = target)
       or (f.requester = target and f.addressee = auth.uid())
  ) then
    return 'exists';
  end if;
  insert into public.friendships (requester, addressee, status)
  values (auth.uid(), target, 'pending');
  return 'ok';
end $$;

grant execute on function public.send_friend_request(text) to authenticated;
grant execute on function public.can_view_activities(uuid, uuid) to authenticated;
