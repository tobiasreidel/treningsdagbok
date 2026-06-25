-- ============================================================================
-- Treningsdagbok — prevent duplicate intervals.icu imports
-- ============================================================================
-- Run this in the Supabase SQL editor (after schema.sql + intervals.sql).
--
-- Belt-and-suspenders for the import de-dupe: even if two imports race (the
-- background auto-import on app open overlapping with a manual import, say),
-- this unique index guarantees the same intervals.icu activity can never be
-- stored twice. The app treats the resulting unique-violation as "already
-- imported" and moves on.
--
-- Partial index: only rows that actually came from intervals.icu carry an
-- intervals_id, so manual sessions (where it's null) are unaffected.
-- ============================================================================

-- Step 1: remove any duplicates that already slipped in before the index
-- existed, keeping the earliest copy of each activity. (routes cascade-delete
-- with their session, and imported sessions have no photos, so this is safe.)
delete from public.sessions s
using (
  select id
  from (
    select id,
           row_number() over (
             partition by user_id, (extra ->> 'intervals_id')
             order by created_at, id
           ) as rn
    from public.sessions
    where extra ->> 'intervals_id' is not null
  ) ranked
  where ranked.rn > 1
) dups
where s.id = dups.id;

-- Step 2: now that duplicates are gone, enforce uniqueness going forward.
create unique index if not exists sessions_user_intervals_id_uidx
  on public.sessions (user_id, (extra ->> 'intervals_id'))
  where extra ->> 'intervals_id' is not null;
