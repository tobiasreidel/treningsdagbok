-- ============================================================================
-- Treningsdagbok - Phase 3: intervals.icu integration
-- ============================================================================
-- Run this in the Supabase SQL editor (after schema.sql).
--
-- Stores each user's intervals.icu credentials so the PWA can pull cycling
-- activities directly from the browser (intervals.icu allows CORS + API-key
-- auth, so no server proxy is needed). RLS keeps the key private to its owner.
--
-- Imported rides are de-duplicated via sessions.extra->>'intervals_id'
-- (a JSONB field - no schema change needed for that).
-- ============================================================================

create table if not exists public.user_settings (
  user_id              uuid primary key default auth.uid()
                         references auth.users (id) on delete cascade,
  intervals_athlete_id text,            -- numeric id, or '0' for "me"
  intervals_api_key    text,            -- personal API key (private via RLS)
  updated_at           timestamptz not null default now()
);

alter table public.user_settings enable row level security;

drop policy if exists "settings are private to owner" on public.user_settings;
create policy "settings are private to owner" on public.user_settings
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
