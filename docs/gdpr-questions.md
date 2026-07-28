# Open questions before a club uses this

**Status: unanswered. Not legal advice, and not answerable from inside the
repo.** These are written down because the app is about to hold health data
about minors, and the questions are cheaper to answer before that than after.

The moment a climbing team uses this, the app is processing:

- **Health data**, which GDPR Article 9 treats as a special category: the OSTRC
  overuse questionnaire (pain, reduced participation), injury records, daily
  wellness, bodyweight, and now derived signals shared with a coach.
- **Data about children**, which Article 8 adds consent rules to: a youth squad
  is 13 to 17 year olds.
- **In Norway**, so the Norwegian Data Protection Authority (Datatilsynet) is
  the supervisory authority and its guidance applies on top of the regulation.

## The questions

1. **Who is the data controller when a club uses it?** Today the answer is
   clean: each athlete controls their own account and chooses to show a coach.
   If a club starts directing how the data is used, the club plausibly becomes
   controller and the app becomes a processor, which brings a processing
   agreement, a records-of-processing obligation and a different consent story.
   Keeping it "athletes self-log and grant access" is dramatically simpler and
   is worth defending as a design decision, not just a default.
2. **What is the lawful basis for the health data?** Consent is the obvious
   candidate under Article 9(2)(a), which means it has to be freely given,
   specific and withdrawable. "Freely given" is the hard part in a coach and
   athlete relationship: an athlete who feels they cannot say no has not
   consented. The per-coach, per-athlete, revocable sharing toggle exists partly
   for this, but it needs checking against what freely given means here.
3. **What does parental consent look like for under-16s?** Article 8 sets the
   threshold at 16 unless national law lowers it (Norway's is 13 for information
   society services). Whatever the age, the mechanics matter: who consents, how
   it is recorded, and what happens when a 15 year old turns 16.
4. **How does deletion work when an athlete leaves the team?** Account deletion
   already exists and removes everything, including storage objects. The open
   part is the coach's copy of the picture: signal snapshots are the athlete's
   own rows and go with the account, but confirm nothing survives in an export a
   coach took, and decide what the club is allowed to keep.
5. **Where is the data stored, and does that need saying?** Supabase region and
   any sub-processors should be written down somewhere a parent could read.
6. **Is a DPIA needed?** Health data plus children plus systematic monitoring is
   the combination that usually triggers one. Probably yes; worth asking.

## What already helps

- Account deletion is implemented end to end (`api/delete-account.js`),
  including storage objects.
- Full data export exists, which covers the access and portability rights.
- Every coach table is private by default; the coach grant is per person, opt-in
  and revocable, and gives derived signals and OSTRC only, never the raw daily
  wellness entries or free-text notes.
- No bodyweight history is kept at all, so the most sensitive series simply does
  not exist.
- No cross-athlete comparison of performance, by design (see the handoff
  document, section 13.4).

## Where to ask

The university will have people who deal with this routinely, and this is a
better question for them than for a search engine. Datatilsynet also publishes
guidance for sports clubs.
