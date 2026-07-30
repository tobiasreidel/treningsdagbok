-- ============================================================================
-- user_prefs: your settings follow the account, not the browser.
--
-- Safe to re-run.
--
-- WHY
-- ---
-- Every preference the app had lived in localStorage: enabled sports, theme,
-- dashboard widgets, heart rate zones, the gear toggles, whether the coach is
-- on. That is per browser, per device. Signing in on a laptop gave you a
-- factory-fresh app and put you back through onboarding, and turning a setting
-- on where you happened to be standing did nothing anywhere else.
--
-- Settings belong to the account. localStorage keeps a copy so the app still
-- paints instantly and works offline, but it is a cache now, filled from here
-- at sign-in (see src/lib/prefs.js).
--
-- SHAPE, ON PURPOSE
-- -----------------
-- One row per setting, not one blob per user. Two devices changing two
-- different settings must not overwrite each other, and a single blob makes
-- every write a last-writer-wins race over everything at once.
--
-- The value is jsonb because these are booleans, numbers, strings and small
-- arrays, and a new setting should not need a migration. src/lib/prefs.js is
-- the only place that interprets it: keep it that way, for the reason
-- sessions.extra had to be pulled back into one interpreter.
-- ============================================================================

create table if not exists public.user_prefs (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- The setting's name, as used in src/lib/prefs.js (e.g. 'enabledSports').
  key        text not null check (length(key) between 1 and 64),
  -- Whatever that setting holds. NULL means "back to the default", which is
  -- how a device says "I unset this" without the row having to disappear.
  value      jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.user_prefs enable row level security;

-- Yours and nobody else's: no friend, coach or squad policy belongs here.
-- These say nothing about training and there is no screen that shows someone
-- else's settings.
drop policy if exists "own prefs" on public.user_prefs;
create policy "own prefs" on public.user_prefs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
