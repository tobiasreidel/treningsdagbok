# The youth finger-training claim, and its date

**Claim as the app relies on it:** controlled finger training (dead-hangs within
a sensible programme, begun on large holds and increased gradually) loads a
growing climber's fingers *less* than finger-heavy bouldering does, so the
Norwegian Climbing Federation (Norges Klatreforbund) no longer advises against
dead-hangs for growing athletes. What it does still advise against is campus
training and a one-sided training focus.

**Status: NOT independently verified. Recorded 2026-07-28.**

This is load-bearing and it needs checking against the federation's current
published wording, because it is the claim that lets the app override what a
naive reading of youth guidance would say.

## Why it is load-bearing

It is doing real work in the engine, not just sitting in copy:

- `suggestSession` in `src/lib/coach.js` deliberately does **not** blanket-block
  `fingerStrength`, `power` or `limit` for under-18s. An earlier version did, and
  it refused a competition junior essentially their whole programme during a
  championship build-up, offering volume bouldering instead.
- Gating happens per exercise instead: `youth: 'blocked'` removes campus and
  one-arm work outright (F3, B10, S3), `allowed_reduced` caps hangs at 80% of max
  instead of 90% and takes a set off (`youthAdjust`).
- A variety cap allows at most two sessions of the same category in a rolling
  seven days, which is the enforceable reading of "not a one-sided focus".
- The Coach page states the reasoning to the user in `src/pages/Coach.jsx`, so a
  parent or a coach can read what the app believes and why.

If the claim is wrong, or if the federation's position has moved, the right fix
is not a copy edit: the per-exercise gates and the 80% cap are what would have to
change.

## What to check

1. The federation's current published guidance on finger training for youth
   (Norges Klatreforbund, coaching and development material).
2. Whether the campus and one-sided-focus restrictions are still stated as such.
3. Whether any age or maturity threshold is given, and how it compares to the
   app's use of 18 as a chronological proxy for skeletal maturity, with 18 to 20
   treated as a note rather than a restriction.

## When you have checked it

Replace the status line above with the date, the source, and its own retrieval
date, in this form:

```
Status: verified against <source>, retrieved <YYYY-MM-DD>.
```

Then, if the wording differs from the summary at the top of this file, update the
summary to match the source rather than the other way round, and re-read the code
listed above against it.

## Standing rule

Any claim from an external body that changes what the app prescribes gets a note
like this one, with a date. A live position that can move must never be quoted in
the app as though it were settled and undated.
