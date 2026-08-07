// What's new - user-facing release notes, newest first. Linked from
// Settings → “What’s new”, and shown on the Changelog page.
//
// Keep it short. This is read in ten seconds on a phone, not studied: one line
// per change, the change itself and not the reasoning behind it, and a handful
// of lines per release at most. Anything a user would not go looking for (a
// filter that reset, a chart that drew wrong) belongs in a single “Bug fixes:”
// line, not a paragraph of its own. One entry per date.
export const CHANGELOG = [
  {
    date: '2026-08-07',
    title: 'E-bike rides, and a tidier logbook',
    changes: [
      'New cycling type: E-bike, marked with a ⚡ wherever a session is listed.',
      'E-bike rides from intervals.icu arrive already marked as one.',
      'Cycling records and your Eddington number skip e-bike rides. Hours, load and the charts still count them.',
      'The logbook keeps your filters and search when you come back from a session.',
      'Screens open at the top instead of wherever you were last scrolled.',
      '“Log this again today” is gone from the logbook.',
    ],
  },
  {
    date: '2026-07-31',
    title: 'Charts you can read',
    changes: [
      'Every chart has a scale down the left, on round numbers.',
      'More numbers and dates are labelled, and the last bar always is.',
      'The activity charts (heart rate, power, speed, elevation, cadence) have a scale too.',
    ],
  },
  {
    date: '2026-07-30',
    title: 'Settings follow your account',
    changes: [
      'Sports, widgets, theme, zones and toggles live on your account now, so every device has the same setup. Your current settings carry over.',
      'The register form shows the whole details step again, instead of hiding it behind “Add detail”.',
    ],
  },
  {
    date: '2026-07-29',
    title: 'Readiness stops reading your training back at you',
    changes: [
      'Readiness needs your check-ins or HRV before it shows a number, so a normal hard block no longer reads as a warning.',
      'The page says how much of the score is actually reporting, and how many days an input still needs.',
      'Bug fixes: weeks of bad sleep are called out even before there is a score.',
    ],
  },
  {
    date: '2026-07-28',
    title: 'The coach stops nagging',
    changes: [
      'Hard work on small holds is no longer scored like a maximal hang, so the coach stops prescribing technique drills forever.',
      'Today says why in one line instead of four chips at equal weight.',
      'A session can say Morning, Midday or Evening, and finger recovery then counts hours instead of calendar days.',
      'Indoor sessions can log attempts within a grade of your limit.',
      'The 1-10 scales are two rows of five, big enough to hit with chalky fingers.',
      'For coaches: a squad page with the week’s overuse answers. Athletes turn sharing on per coach, and it never includes check-in entries or notes.',
      'Bug fixes: the hangboard chart showed 0 kg; monotony always read “Steady”.',
    ],
  },
  {
    date: '2026-07-27',
    title: 'The Coach page, rearranged',
    changes: [
      'Three tabs instead of one long scroll: Today, The plan, Tests.',
      'Only the session you are doing is spelled out in full. The alternatives are one line each with a Swap button.',
      'Every test says how to run it and what the number is for.',
      '“Start a testing session” saves the results and puts the day in your diary.',
    ],
  },
  {
    date: '2026-07-26',
    title: 'Works offline, logs the test battery, exports your data',
    changes: [
      'Your diary is stored on your phone too, so the app opens with no signal. It says when you are looking at a saved copy.',
      'A session can be several sessions: name every part of an afternoon.',
      'The Norwegian Climbing Federation test battery can be logged, left and right. A test stopped for pain is recorded as that.',
      'Download your data from Settings → Your data.',
      'Pick your own session for today on the Coach page. It lasts the day.',
      'Bug fixes: quicker launch, hangboard sets that cannot be read without your bodyweight now say so, deleting your account deletes your photos.',
    ],
  },
  {
    date: '2026-07-24',
    title: 'A training coach on your dashboard (beta)',
    changes: [
      'Turn it on in Settings → Training coach for a Today card on the home screen and a Coach page.',
      'A ten-second daily check-in, and a weekly overuse check.',
      'It suggests a real session: grades scaled to your own limit, sets, rest and edge size, plus this week’s plan and your goals as a countdown.',
      'Finger recovery and readiness, both measured against your own normal.',
      'Climbing sessions take Finger RPE and Pump separately. Only the finger one feeds recovery.',
      'It is a training-awareness aid, not medical advice, and never gives an injury-risk number. Pain is the real signal.',
      'Friends, requests and invites moved to your profile, top-left of the home screen.',
    ],
  },
  {
    date: '2026-07-12',
    title: 'See your friends’ charts',
    changes: [
      'Open a friend’s activity for the charts, heart-rate zones and laps.',
      'Your route is never shared. Sharing follows “Friends can see” in Settings → Privacy.',
    ],
  },
  {
    date: '2026-06-28',
    title: 'Smoother charts on iPhone',
    changes: [
      'Bug fixes: scrubbing along a chart on iOS, and power now shows your true max.',
    ],
  },
  {
    date: '2026-06-15',
    title: 'Gear and maintenance tracking',
    changes: [
      'Track bikes, running shoes and climbing gear, and log maintenance like tires, chain oiling or resoles.',
      'Turn it on per sport in Settings → Gear. The log lives on your profile.',
    ],
  },
]
