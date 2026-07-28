# Database

Migrations live in `migrations/`, named `<timestamp>_<name>.sql`, applied in
filename order. Every one is written to be safe to run again.

## Applying them

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

`link` is once per machine and will ask for the database password. `db push`
applies anything the project has not seen yet and records it, so running it
twice is a no-op rather than a re-run.

## Why this replaced "run this file in the SQL editor"

Every migration used to be applied by hand, which meant the app carried UI whose
only job was to say "your tables are from an earlier version, run this SQL
file", and the only record of what had been applied was memory. That is fine for
one person and does not survive a second, let alone a squad. The CLI keeps the
ledger, and the same files run against a local database.

The app still degrades rather than breaking when a table is missing
(`isMissingTable` guards every read), because a half-migrated install must not
lose data. That guard stays: it is what makes a failed push recoverable.

## Order and history

The timestamps before 2026-07-23 are backfilled. They record the order the files
were written in and applied by hand, not the dates. Anything from
`20260723000000_gear.sql` onward carries its real date.

```
20260101000000_schema.sql             sessions, routes, RLS, storage
20260101000100_more_sports.sql        swimming, strength, finger
20260101000200_strength.sql           strength sets in extra
20260101000300_finger.sql             hangboard + campus in extra
20260101000400_second_go.sql          the 2nd-go send type
20260101000500_health.sql             period log, injuries
20260101000600_intervals.sql          intervals.icu credentials
20260101000700_dedupe_intervals.sql   one session per imported activity
20260101000800_friends.sql            friends, sharing toggle
20260101000900_coaches.sql            coach links (read-only account access)
20260101001000_feedback.sql           in-app feedback
20260101001100_fix_rls.sql            RLS corrections
20260723000000_gear.sql               gear items + maintenance events
20260723120000_session_streams.sql    shared chart copies for friends
20260725000000_coach.sql              coach profile, goals, wellness, OSTRC
20260727000000_coach_v4.sql           finger tests, physical tests, bodyweight
20260728000000_coach_squad.sql        athlete-granted signal sharing + squad
```

## Writing a new one

Name it with today's timestamp so it sorts last:

```bash
npx supabase migration new whatever_it_does
```

Then keep to the two rules the existing files follow:

1. **Idempotent.** `create table if not exists`, `add column if not exists`,
   `drop policy if exists` before `create policy`.
2. **One contiguous block per table**: create, index, enable RLS, add policies.
   A statement that fails must never leave a table created but unprotected.
