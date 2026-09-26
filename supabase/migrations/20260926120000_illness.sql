-- ============================================================================
-- Treningsdagbok - illness log
-- ============================================================================
-- Safe to re-run: every statement is idempotent.
--
--   * illnesses - one row per episode, like an injury: when it started, the
--     last day you were ill (null while you still are), and what kind of ill.
--
-- WHY TWO SYMPTOM COLUMNS
-- -----------------------
-- The coach acts on the kind of illness, sorted the way doctors do it at the
-- door: above the neck only (a cold), below the neck (chest, stomach, aches),
-- or a fever. `symptoms` is how it is now, and it changes as the episode does:
-- a fever that has gone but left a cold means easy movement is back on.
-- `worst` is the worst it got, and it is what sets how gradually you come back
-- once it is over. Two days of fever followed by three days of sniffles is not
-- a cold, and the return should not treat it as one.
--
-- Strictly private to its owner, like injuries: no friend, coach or squad
-- policy ever references this table.
--
-- Structure note: the table is created, indexed and locked down with RLS in
-- one contiguous block, so a statement that fails can never leave it created
-- but unprotected.
-- ============================================================================

create table if not exists public.illnesses (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  started    date not null,
  ended      date,                                   -- last day ill; null = still ill
  symptoms   text not null check (symptoms in ('head', 'body', 'fever')),
  worst      text not null check (worst in ('head', 'body', 'fever')),
  note       text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now(),
  constraint illnesses_ended_after_started check (ended is null or ended >= started)
);

create index if not exists illnesses_user_idx on public.illnesses (user_id, started desc);

alter table public.illnesses enable row level security;

drop policy if exists "illnesses are private to owner" on public.illnesses;
create policy "illnesses are private to owner" on public.illnesses
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
