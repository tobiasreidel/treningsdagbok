-- ============================================================================
-- Treningsdagbok - Feedback (bug reports + feature requests)
-- ============================================================================
-- Run once in the Supabase SQL editor (after schema.sql). Safe to re-run.
--
-- Every report is recorded here first (a durable record you can read in the
-- dashboard), then emailed to you by the /api/feedback Vercel function. Two
-- layers keep this from being abused/flooded:
--   1. RLS - only *signed-in* users can insert, and only as themselves.
--   2. A per-user rate-limit trigger - caps how many a single account can file
--      in a rolling hour/day, so one user (or a leaked token) can't DDoS your
--      inbox. The email only goes out after a row is successfully inserted, so
--      the cap throttles the email too.
-- ============================================================================

create table if not exists public.feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  email       text default auth.email(),             -- submitter, for reply-to
  type        text not null check (type in ('bug', 'feature')),
  message     text not null check (char_length(message) between 1 and 2000),
  created_at  timestamptz not null default now()
);

create index if not exists feedback_user_created_idx
  on public.feedback (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security: signed-in users may file their own feedback, nothing
-- else. There is intentionally no select/update/delete policy - you read the
-- table from the Supabase dashboard / SQL editor, not through the public API.
-- ---------------------------------------------------------------------------
alter table public.feedback enable row level security;

drop policy if exists "file own feedback" on public.feedback;
create policy "file own feedback" on public.feedback
  for insert to authenticated
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Per-user rate limit. Tune the two thresholds below to taste.
-- ---------------------------------------------------------------------------
create or replace function public.feedback_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  per_hour constant int := 5;    -- max reports per rolling hour
  per_day  constant int := 20;   -- max reports per rolling day
  recent_hour int;
  recent_day  int;
begin
  select count(*) into recent_hour
    from public.feedback
    where user_id = new.user_id and created_at > now() - interval '1 hour';
  if recent_hour >= per_hour then
    raise exception 'rate_limit_hour' using errcode = 'P0001';
  end if;

  select count(*) into recent_day
    from public.feedback
    where user_id = new.user_id and created_at > now() - interval '1 day';
  if recent_day >= per_day then
    raise exception 'rate_limit_day' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists feedback_rate_limit on public.feedback;
create trigger feedback_rate_limit
  before insert on public.feedback
  for each row execute function public.feedback_rate_limit();
