// What's new - user-facing release notes, newest first. Linked from
// Settings → “What’s new”, and shown on the Changelog page. Plain language on
// purpose: this is for the handful of friends using the app, not a commit log.
// Add a new entry at the top whenever something ships that people would notice.
export const CHANGELOG = [
  {
    date: '2026-08-07',
    title: 'E-bike rides have a place to go',
    changes: [
      'Cycling has a third type next to Road and Gravel: E-bike. It is still a ride, it still counts as training time and it still shows up in your cycling hours and load, but it is marked with a ⚡ everywhere a session is listed so you can tell at a glance which rides had a motor.',
      'intervals.icu brings them in by itself. An e-bike ride there arrives here already marked as one, so there is nothing to fix up afterwards.',
      'The cycling records, longest ride, biggest climb, top speed, best average power and your Eddington number, now leave e-bike rides out. Part of that distance was the battery, and mixing the two made the numbers mean nothing. The totals and the charts still count every ride, and the records say how many rides they skipped.',
    ],
  },
  {
    date: '2026-07-31',
    title: 'The charts say what they are measuring',
    changes: [
      'Every chart now has a scale down the left, on round numbers. Before, a bar was tall or short and there was nothing on the page to tell you tall meant six hours or sixty.',
      'The numbers on the points used to be thinned to a fixed one in four, whether or not the rest would have fitted. They are now packed in wherever there is room: a 13-week chart labels all thirteen bars, and the 28-day load chart labels all 28 days. On a crowded chart the peaks, the dips and the most recent day are kept first.',
      'Dates along the bottom got the same treatment, and the last bar is always labelled, so you can see where a chart ends.',
      'The activity charts, heart rate, power, speed, elevation and cadence, have a scale too. You no longer have to slide along a ride to find out roughly how high or how hard it was.',
      'Numbers sitting on top of a line are outlined in the card colour so they stay readable.',
    ],
  },
  {
    date: '2026-07-30',
    title: 'Your settings follow you between devices',
    changes: [
      'Settings were stored in the browser, so they were per device. Signing in on a laptop gave you a factory-fresh app: sports back on, widgets back to the defaults, the gear and coach toggles off, and the welcome screen again. Turning something on where you happened to be standing did nothing anywhere else.',
      'They belong to your account now. Sports, dashboard widgets, theme, heart rate zones, the gear and period and coach toggles, the short-ride filter: set them once, on any device, and every other device has them the next time it opens.',
      'Your current settings are carried over the first time you open this version, so nothing to redo. Changes made offline are sent the next time you have signal.',
    ],
  },
  {
    date: '2026-07-30',
    title: 'The details step shows the details again',
    changes: [
      'The register form no longer hides most of the details step behind “Add detail”. Date, pump, time of day, feeling, warm-up, rehab, gear and the sport-specific numbers are all on the page from the start.',
    ],
  },
  {
    date: '2026-07-29',
    title: 'Readiness stops reading your training back at you',
    changes: [
      'Readiness could slide lower and lower through a normal training block while you felt fine. With no daily check-ins and no intervals.icu, the only input left was form, fitness minus fatigue, and it was quietly promoted to the entire score. Form falls through any hard block, so the score was reporting your training schedule as if it were a symptom, and the coach handed out recovery days on the strength of it.',
      'It now needs something that actually measures how you are responding, either your check-ins or HRV, before it shows a number at all. Form still counts, capped tighter than the rest, and can no longer run the score by itself.',
      'Missing inputs used to hand their weight to whatever was left, so one number could become the whole score. Below 60% of the inputs the score is pulled back toward normal instead, and the page says how much of it is reporting.',
      'While an input is still building its baseline the page says how many days you have logged and how many it takes, instead of “no data”, which read like your check-ins were being ignored.',
      'Weeks of bad sleep are still called out even before there is a score, since that check compares you against the scale rather than against your own normal.',
    ],
  },
  {
    date: '2026-07-28',
    title: 'The coach stops nagging, and starts showing its work',
    changes: [
      'The coach used to tell an ordinary three-times-a-week climber to do technique drills more or less forever. Its idea of a “hard finger day” counted any session on small holds, which is most sessions, so the 28-day ceiling was permanently over the line. Working hard on small holds is no longer scored the same as a maximal hang, the ceilings are higher, and there is a band between “fine” and “stop” instead of a cliff.',
      'The finger-load maths was refitted. The old version said it had been changed so a long repeater session would not outscore a max hangboard session, and it still did. Now a session works out to what the exercise library says it should cost, which also means the library tests the maths.',
      'Today shows one line saying why, instead of a row of chips at equal weight. The four signals fold into a single row and only open themselves when something wants looking at.',
      'Readiness can now see a bad month. It compares you against your own recent normal, so two months of poor sleep used to read as “normal”. It now says so in words, separately from the number.',
      'Monotony was incapable of firing for anyone who takes rest days, so it read “Steady” forever. It now measures whether your sessions differ from each other, and says “not meaningful at your training frequency” when it cannot tell.',
      'New: “Log this again today” on any session in the logbook, which opens the form filled in and dated today. A hangboard protocol is nearly the same every week.',
      'Logging is faster: duration, RPE and finger RPE, then save. Everything else is behind “Add detail”. Finger RPE moved up, because it is the number the coach leans on hardest.',
      'The 1-10 scales are two rows of five. Ten buttons across a phone left each one about 26 px wide, which is not a target you can hit with chalky fingers.',
      'A session can say Morning, Midday or Evening. The finger-recovery window then counts hours instead of calendar days, so a Monday evening to a Wednesday morning is 34 hours and not two days.',
      'Indoor sessions can log “attempts within a grade of your limit”. Only outdoor route logs used to count, so the coach could barely see how hard an indoor session was.',
      'The Finger tab’s hangboard chart has been showing 0 kg since loads moved to total kilos. Fixed, and it now says total kilos, which is what it is.',
      'Where a number is a starting point rather than a finding, the screen says so next to the number instead of in a disclaimer three taps away.',
      'For coaches: a squad page with this week’s overuse answers, athletes down the side and body areas across. Athletes turn sharing on per coach and can turn it off again, and it shares signals and overuse answers only, never your daily check-in entries or your notes.',
    ],
  },
  {
    date: '2026-07-27',
    title: 'The coach, rearranged, and testing has its own place',
    changes: [
      'The Coach page is three tabs instead of one long scroll: Today, The plan, Tests. Today is what to do now and why, and it went from five screens of scrolling to about two.',
      'Under “What to do”, only the session you’re doing is spelled out in full. The alternatives sit as one line each with a Swap button, so you can see all your options at once.',
      'The test battery moved out of the setup form onto its own tab, and every test now tells you how to run it and what the number is for. Tap any test to read it.',
      '“Start a testing session”: fill in what you tested, and it saves the results and puts the session in your diary. A testing day is training, and a maximal finger test counts as the hard finger day it is.',
      'Better names throughout: the dashboard button now says “See the full session”, and “Signals” is “Where you’re at”.',
    ],
  },
  {
    date: '2026-07-26',
    title: 'Works offline, logs the test battery, exports your data',
    changes: [
      'A session can now be several sessions. Slab, then campus, then 4×4s is one afternoon: name all of it, and a mobility session can list every stretch instead of just one. The coach counts the hardest part, not the sum, so an afternoon still reads as one day of loading.',
      'Your training is now stored on your phone as well as the server, so the app opens with your diary in it even with no signal: a gym basement, a plane, abroad. It says when you’re looking at a saved copy.',
      'Opening the app is quicker: it used to download your whole history three times over on every launch.',
      'The Norwegian Climbing Federation’s test battery can now be logged: fingers, strength, power and mobility, left and right separately. A test you stop because of pain is recorded as that, and the coach backs off for a few weeks.',
      '“Log this session” on the Coach page: it opens the form with the sport, the length and the plan already filled in.',
      'Download your data from Settings → Your data: sessions as a spreadsheet, or everything as a JSON file to keep.',
      'A hangboard set logged as added weight now says when it can’t be read without your bodyweight, instead of quietly counting for less than it should.',
      'Deleting your account now deletes your photos too, rather than leaving them in storage.',
    ],
  },
  {
    date: '2026-07-26',
    title: 'Pick your own session for today',
    changes: [
      'Under “Sessions that fit” on the Coach page, tap any of the alternatives to make it today’s session. The coach’s first choice is a suggestion, not an order.',
      'Your pick carries through to the Today card on the home screen and to “as planned” when you log the session.',
      'It only lasts the day, and tapping the one on top hands the choice back to the coach.',
    ],
  },
  {
    date: '2026-07-24',
    title: 'A training coach on your dashboard (beta)',
    changes: [
      'A daily check-in: sleep, fatigue, soreness and stress, ten seconds a day. Rest days too, and that’s the point, since a score built only from days you trained never sees the days you felt too rough to train.',
      'A weekly overuse check based on the OSTRC questionnaire from the Oslo Sports Trauma Research Centre, so the coach can back off when something is building rather than waiting until you call it an injury.',
      'Injuries can now say which part of you, so the coach routes around that area instead of guessing.',
      'Turn it on in Settings → Training coach to get a “Today” card on your home screen, with the full picture on a new Coach page.',
      'Finger-tissue recovery: how long since your last hard finger session, against the ~48–72 h window your tendons and pulleys take to rebuild.',
      'Readiness: one number against your own normal, built from how you’ve felt plus HRV, resting heart rate and form when intervals.icu is connected.',
      'A load trend (this week against the baseline you’ve built) and a monotony check for when every day starts to look the same.',
      'A suggested session with real numbers (grades scaled to your own limit, volume, rest and target RPE), plus this week’s plan. Pick linear or undulating in the Coach page.',
      'Tell it about yourself once (grades, how often you train, what you have access to, injury history) and it prescribes real sessions from the training plan: F1 Max deadhang, B3 4×4, K5 Up–Down–Up, with sets, reps, rest and edge size. Browse them all in the exercise library.',
      'Write down your goals with dates. A competition or a trip turns the plan from a repeating loop into a countdown that peaks on the day.',
      'Climbing and finger sessions now take two separate ratings: “Finger RPE” for crimping and “Pump” on a 1–5 scale. They’re different things, since pump clears in hours and finger tissue takes days, and only the finger one feeds the recovery window.',
      'It’s beta: the thresholds are educated starting points. It’s a training-awareness aid, not medical advice, and it deliberately never gives an injury-risk number. Pain is always the real signal.',
    ],
  },
  {
    date: '2026-07-24',
    title: 'Friends live on your profile',
    changes: [
      'Your friends, friend requests and invites moved to your profile: tap your picture, top-left of the home screen.',
      'See everyone you’re connected with at a glance, and add a friend by email right there.',
      'A little dot appears on your profile picture when someone wants to connect.',
      'Added this “What’s new” page so you can catch up on changes.',
    ],
  },
  {
    date: '2026-07-12',
    title: 'See your friends’ charts',
    changes: [
      'Open a friend’s activity to see the charts, heart-rate zones and laps, not just the summary.',
      'Your route is never shared, only the charts.',
      'Sharing happens automatically while “Friends can see” is on (Settings → Privacy).',
    ],
  },
  {
    date: '2026-06-28',
    title: 'Smoother charts on iPhone',
    changes: [
      'Fixed scrubbing your finger along a chart on iOS.',
      'Power now shows your true max for the activity, not a smoothed number.',
    ],
  },
  {
    date: '2026-06-15',
    title: 'Gear & maintenance tracking',
    changes: [
      'Track bikes, running shoes and climbing gear, and log maintenance like new tires, chain oiling or resoles.',
      'Turn it on per sport in Settings → Gear; the log lives on your profile.',
    ],
  },
]
