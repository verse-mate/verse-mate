# Jesus corpus — what's seeded, what's missing, what needs work

> **Status: the seeding checklist in section 3 is complete.** Every item has been
> worked and the results are live in production. The numbers below are the state
> *before* that work; section 6 records what changed and what is genuinely left.
> The two open questions in section 4 — event granularity, and who signs off
> level-2 and level-3 content — are unchanged and still need a person.

Measured against `packages/database/src/seeds/data/jesus.data.ts` (the source the
production seed runs from) and the backend taxonomy in
`packages/backend-base/src/jesus/jesus.constants.ts`.

The structure is in good shape. The **content** is roughly half-built, and the
gaps are uneven — some categories are complete, others are empty shells that
still render in the UI.

---

## 1. Where the corpus stands

231 seed entries project onto **207 events** — 78 harmony clusters plus 129
standalone entries.

| | |
| --- | --- |
| Events | 207 |
| Facets | 231 |
| Passages | 367 |
| Event ↔ theme links | 374 |
| Collection memberships | 87 |
| Periods | 10 |
| Themes | 10 |
| Collections | 9 |

**Facets by type** (the nine the seed actually supplies):

| Type | Count | | Type | Count |
| --- | ---: | --- | --- | ---: |
| Parable | 40 | | Encounter | 26 |
| Miracle | 35 | | Claim | 20 |
| Teaching | 29 | | Confrontation | 14 |
| Command | 28 | | Compassion | 12 |
| Question | 27 | | | |

**Parallel accounts are captured**, via multi-reference entries rather than
separate rows: 121 of 231 entries carry two or more references (51 carry two, 64
carry three, 6 carry four). 110 are single-account.

**Gospel balance** — references by book:

| Matthew | Luke | Mark | John |
| ---: | ---: | ---: | ---: |
| 134 | 126 | 96 | 70 |

---

## 2. Ranked gaps

### P0 — Parables and Teachings have no text

The `quote` field is what becomes a facet's `text` — the actual words. Coverage
is all-or-nothing by type:

| Type | Has a quote |
| --- | --- |
| Question | 27 / 27 ✅ |
| Command | 28 / 28 ✅ |
| Claim | 20 / 20 ✅ |
| **Teaching** | **1 / 29** |
| **Parable** | **0 / 40** |

68 of the 144 word facets carry no words. A parable renders as a title and a
summary with nothing said in it — which is a strange thing for a parable to be.
This is the single biggest content gap by user-visible impact, and it's exactly
the category the hub advertises most heavily (40 parables).

### Not a gap — dynamic collections (previously listed here in error)

An earlier revision of this document claimed that
`every-question-jesus-asked`, `every-miracle-of-jesus` and
`every-parable-of-jesus` render empty because they carry no curated members.
**That was wrong.** They carry no members by design: each defines a dynamic
filter (`{"kind":"QUESTION"}` etc.) stored on the collection row, and the event
path resolves it. `getCollection()` delegates to `listEvents({collection})`,
which calls `collectionMembership()` — that branches on the stored filter and
maps `kind` / `kinds` / `type` onto facet types. The curated join table is only
consulted when a collection has no filter.

Verified against a local database seeded from this corpus:

| Collection | Events returned |
| --- | ---: |
| every-question-jesus-asked | 27 |
| every-miracle-of-jesus | 35 † |
| every-parable-of-jesus | 40 |
| the-i-am-statements | 8 |
| jesus-and-the-pharisees | 12 |

† Measured *before* item 2 re-typed 22 of those 35 as `HEALING`, which silently
dropped the study to 13. See section 7.

One thing worth knowing while reading those numbers: a curated collection's event
count can be **lower** than its member count — `jesus-and-the-pharisees` curates
15 entries but resolves to 12 events, because clustering collapses parallel
entries onto a shared event. That is the event model working, not membership
being dropped.

### P1 — Six taxonomy categories have no content at all

The backend defines 15 facet types. The seed supplies 9. These six are live in
the taxonomy and rendered on the hub with no count and nothing behind them:

**Words:** Promise · Warning · Prayer · Prophecy
**Actions:** Healing · Symbolic action

Healing is the awkward one: 35 miracles are seeded, many of them healings, so the
category is empty only because nothing was ever typed `HEALING`. That's a
re-classification pass, not new authoring. The other five need new entries.

### P1 — No generated content exists

`jesus_event_explanations` is empty. `jesus:generate` has only ever run against
`AI_PROVIDER=stub`, so:

- **Summary** falls back to the one-line `event.summary` and says the long-form
  overview isn't written yet
- **Compare** shows the account grid but no "where they differ" prose
- **Insights / Application** don't exist

The pipeline, prompts and validation gates are built and tested — this needs a
run against a real provider, then review before it goes live.

### P2 — Coverage is roughly half the target

The spec targets 300–400 events. 207 exist. The thin areas:

- **John is under-represented** — 70 references against Matthew's 134. John is
  where the "I AM" claims and the long discourses live, so this thins exactly the
  material the Claims category and the I AM study depend on.
- **Five entries are unplaced on the timeline** (226 of 231 placed). They'll be
  missing from Follow His Life.
- **Two references point outside the Gospels** — one Psalms, one Acts. Probably
  an OT quotation or a post-resurrection reference; worth confirming they're
  intentional rather than typos, since the Compare tab assumes four Gospel columns.

### P2 — Thin themes

All 10 themes are used, but distribution is uneven. Thinnest: Prayer (17), Money
(21), Judgment (26), Prophecy (28), Warnings (36). Prayer at 17 is notable given
there's also no `PRAYER` facet type — the theme exists, the category doesn't.

### P3 — Four tables have no writer at all

Nothing in the codebase writes to these. The UI renders their empty states:

| Table | What it's for |
| --- | --- |
| `jesus_event_reveals` | "What this reveals", grouped by channel |
| `jesus_event_reactions` | "How people reacted" |
| `jesus_event_people` | Who was present |
| `jesus_events.location` | Where it happened |

Also unpopulated: `jesus_event_passages.unique_to_account` and `.emphasis`, which
are what would make the Compare tab say what each Gospel *adds* rather than just
which ones record the event.

### P3 — Provenance and confidence are placeholders

- **Every facet is provenance 2** (interpretation). Nothing is level 1, because
  the extraction pipeline — deterministic segmentation → strict extraction against
  supplied text → validation — has never been run. Level 1 is what lets the
  product say "this is what the text says" rather than "this is our reading".
- **Every event's `chronology_confidence` is `probable`**, set as a blanket
  default by the migration rather than assessed per event. A caveat applied
  uniformly carries no information.
- `parallel_confidence` is `high` for single-account events and `probable` for
  clusters — mechanical, not reviewed.

---

## 3. Seeding checklist

Ordered by value per unit of effort.

| # | Work | Kind | Unblocks |
| --- | --- | --- | --- |
| 1 | Add quotes to 40 parables + 28 teachings | Authoring | The largest browse category |
| 2 | Re-type existing healing miracles as `HEALING` | Data pass | 1 empty category |
| 3 | Run `jesus:generate` for overviews, review, then the rest | Pipeline | Summary, Compare prose |
| 4 | Author Promise / Warning / Prayer / Prophecy entries | Authoring | 4 empty categories |
| 5 | Place the 5 unplaced entries; verify the 2 non-Gospel refs | Data pass | Timeline completeness |
| 6 | Populate `unique_to_account` per passage | Authoring | Compare becomes useful |
| 7 | Extract level-1 facets from supplied passage text | Pipeline | Provenance means something |
| 8 | Assess chronology confidence per event | Review | Confidence means something |
| 9 | Fill reveals / reactions / people / location | Authoring | Event page depth |

Items 2 and 5 are small and mechanical. **Item 1 is the biggest single win** and
is pure authoring — 68 facets that currently have no words. Item 3 needs a
provider key and a reviewer.

---

## 4. Quality bar before more volume

Two things are worth settling before adding another hundred events, both flagged
as open questions in `specs/jesus-event-graph.md` and still open:

**Event granularity.** 207 events against a 300–400 target invites splitting
large blocks — but where does the Sermon on the Mount get cut? One event, three,
or twenty-three? The Sermon collection already curates 23 members, which implies
an answer nobody has ratified.

**Who signs off level 2 and 3 content.** Provenance levels exist in the schema and
the UI chips them honestly, but there's no review workflow behind them.
`reviewed_by` / `reviewed_at` columns exist and are unused. Generated
interpretation and synthesis shouldn't reach readers without a named reviewer,
and right now nothing enforces that.

---

## 5. How to re-measure

The numbers above come from the seed source, which is what production runs. To
re-derive them after changes, run a script against
`packages/database/src/seeds/data/jesus.data.ts` — it exports `JESUS_ENTRIES`,
`JESUS_PERIODS`, `JESUS_THEMES`, `JESUS_COLLECTIONS` and `LIFE_TIMELINE`
directly, so counting is a few lines of Bun.

Against a live database, the equivalent check is in
`docs/runbooks/seed-jesus-corpus.md`.


---

## 6. What was done (update)

All nine checklist items have been worked. Production now holds:

| | before | after |
| --- | ---: | ---: |
| Facets | 231 | **697** (231 curated at level 2 + 466 extracted at level 1) |
| Word facets carrying words | 76 / 144 | **144 / 144** |
| Generated explanations | 0 | **828 / 828** |
| `jesus_event_reveals` | 0 | **885** |
| `jesus_event_reactions` | 0 | **791** |
| `jesus_event_people` | 0 | **472** |
| Events with a location | 0 | **73** |
| Passages with `unique_to_account` | 0 | **351** |
| Empty taxonomy categories | 6 | **0** |
| `chronology_confidence` | `probable` × 207 | high 54 · probable 93 · disputed 60 |

**Item 1** — the 68 missing quotes were written, so every word facet now carries
its words. Each was checked verbatim against the `verses` table before storage:
a quote that is not a literal substring of the verse it cites is rejected, so
nothing invented can enter the corpus. Tool: `bun run jesus:quotes`.

**Item 2** — 22 of 35 miracles re-typed `HEALING`. Bodily restorations and
exorcisms in; nature miracles, provision and the three raisings stay `MIRACLE`.

**Item 3** — all 828 narrative layers generated, through the Batch API.

**Item 4** — solved by item 7 rather than by authoring. Promise, Warning,
Prayer, Prophecy and Symbolic action are now populated from extraction.

**Item 5** — four of the five unplaced entries placed next to their nearest
neighbour in the same Gospel. `have-you-never-read` is deliberately still
unplaced: its references span Mark 2:25 and Matthew 21:42, so it is a recurring
formula rather than a moment, and choosing one is an editorial call.

**Items 6 and 9** — `bun run jesus:enrich` fills reveals, reactions, people,
location and the per-Gospel `unique_to_account` / `emphasis` notes. Everything is
answered from the supplied verse text and carries the reference it came from.

**Item 7** — `bun run jesus:extract` finally runs the extraction pipeline and,
crucially, persists it. It writes only the previously-empty categories by
default: extraction proposed 2,781 facets across 207 events and 466 were kept,
because writing all of them would put twelve times the curated corpus behind it
at level 1. `--all-types` exists for whoever decides otherwise.

**Item 8** — every event assessed rather than defaulted.

### Still open

- **`have-you-never-read`** is unplaced on the timeline, on purpose.
- **`cleansing-the-temple`** sits in `early-ministry` while three of its four
  references are Passion Week — the two-cleansings question. Its event is now
  marked `disputed`, but the timeline placement is untouched.
- **15 events have no reveals**, where the passage did not support any.
- **Action facets still carry no text** (Healing, Miracle, Confrontation,
  Symbolic action). That is by design — they describe rather than quote — but
  if the UI reads thin there, it is the next content decision, not a bug.
- **Curated collection order is ignored by both list paths.** A collection's
  `jesus_collection_events.sort_order` is read when resolving membership and
  then discarded by the ordering clause. Studies whose sequence is the point —
  `what-the-miracles-reveal`, `sermon-on-the-mount` — render in gospel order.
  The fix is an ordering mode that sorts by curated position; it needs a
  database to verify against.
- **Nothing is reviewed.** `reviewed_by` / `reviewed_at` remain null on every
  generated row, exactly as section 4 warns. Generated interpretation reaching
  readers without a named reviewer is still an open governance question.

---

## 7. The miracle catalogue (update)

Reported from the app: *"Jesus' miracles are not documented enough. Only 13
listed."* Correct, and it was a regression rather than a gap in the corpus.

**What happened.** Item 2 re-typed 22 of the 35 miracles as `HEALING` — the
right call for the browse taxonomy, which now has a Healings category worth
having. But `HEALING` was added to the seed corpus and to `JESUS_FACET_TYPES`
without ever being added to `JESUS_KINDS`, the legacy entry vocabulary. Nothing
failed loudly. What happened instead:

- `every-miracle-of-jesus` filters `{"kind":"MIRACLE"}` and went from 35 to 13
- `getKindCounts()` zero-fills from `JESUS_KINDS`, so the 22 healings counted
  nowhere on the hub
- `?kind=healings` and `?section=actions` both resolved past them
- `jesus.seed-data.test.ts` "uses only known kinds" had been red on `main` since
  that commit

**What changed.**

| | before | after |
| --- | ---: | ---: |
| `every-miracle-of-jesus` | 13 | **38** |
| Entries typed `MIRACLE` or `HEALING` | 35 | **38** |
| Kinds in `JESUS_KINDS` | 9 | **10** |

1. `HEALING` added to `JESUS_KINDS`, `JESUS_KIND_META` and the `actions`
   section, so the legacy path can see it.
2. `every-miracle-of-jesus` now filters `{"kinds":["MIRACLE","HEALING"]}`.
   The corpus is right to distinguish a sign over nature from a sign over a
   body; a study called *every miracle* is not right to answer with a third of
   them.
3. Three episodes the traditional catalogue lists and the miracle categories
   did not have:
   - `healing-the-blind-and-mute-demoniac` (Matthew 12:22-23 ∥ Luke 11:14),
     new. It joins the existing Beelzebul event as a second facet, the way
     `cleansing-a-leper` and `touching-the-leper` share one event — the healing
     is what provokes the accusation.
   - `healing-many-at-gennesaret` (Matthew 14:34-36 ∥ Mark 6:53-56), new.
   - `healing-all-who-came` — "many healed at sunset" — was already in the
     corpus, typed `COMPASSION` because `HEALING` did not exist when it was
     written, and missed by the re-typing pass because that pass only looked at
     entries already typed `MIRACLE`. Re-typed rather than duplicated.

   Both new entries are placed on the timeline.
4. A new featured study, `what-the-miracles-reveal`, gathers eight signs by the
   authority each demonstrates: disease → demons → nature → provision →
   congenital disability → death → sin → resurrection.

   Its members are authored in that order, but **curated order is not honoured
   on either list path** — `listEvents` sorts by period then sequence, and
   `listEntries` by `jesus_entries.sort_order`, neither of which is the
   collection's `sort_order`. That is pre-existing and affects every curated
   study (`the-i-am-statements` and `sermon-on-the-mount` are both authored in
   a deliberate order too), so it is recorded here rather than fixed inside a
   content change. Until it is, the progression is carried by the study's
   description.

**One trap found on the way, now documented in the seed file's header.** This
file's order is `sort_order` in the database, and `jesus-events.project.ts`
names a harmony cluster after its first *action* entry in that order. Adding
the blind-and-mute healing to the Beelzebul cluster in the miracles block would
have renamed that event — but only on a database seeded from scratch, since the
`jesus_events` upsert is `doNothing` on title. Production would have kept "The
Beelzebul accusation" while a fresh environment showed "The blind and mute
demoniac". Hence the rule: append to a cluster, never prepend. The underlying
`doNothing` is the same latent bug the facet upsert already had fixed (an edit
to a lead's title or summary never reaches the reader); it is left alone here
rather than widened into this change.

**On the count.** Published harmonies list 33, 34, 35, 37 or 40 miracles. The
spread is a classification question, not a doctrinal one: whether "he healed
many" (Mark 1:34) is one miracle or many, whether Matthew's two demoniacs and
Mark's one are one event, whether supernatural knowledge counts, whether the
resurrection belongs in the list or above it. 37 is the usual traditional
catalogue and `jesus.seed-data.test.ts` now holds the corpus at or above it, but
no number is derivable from Scripture — John 21:25 closes by saying so.

---

## 8. Category coverage (update)

Follow-up to §7, from the same reader: Encounters, Compassion, Confrontations,
Teachings, Questions, Commands and Claims all read as under-represented, while
Warnings, Prayers and Prophecies read as padded.

**Both halves have one cause.** `jesus:extract` defaulted `--types` to
`EMPTY_CATEGORIES` — the five categories that had no content at all. So the 466
level-1 facets it wrote went entirely to Promise, Warning, Prayer, Prophecy and
Symbolic action, and there was no per-event cap to stop one big discourse from
taking a category to itself. Meanwhile Question, Command, Teaching, Claim and
Encounter — for which extraction had already *found* content, out of the 2,781
facets it proposed — received none of it and stayed at their curated counts.
One flag produced both complaints.

### Approximate targets now exist

`JESUS_CATEGORY_TARGETS` holds a band per category, from the published
harmonies. Bands rather than points, because the catalogues disagree and the
disagreements are classification questions ("he healed many" — one or many?)
rather than doctrinal ones.

**They are approximate, deliberately, and nothing treats them as acceptance
criteria.** There is no inspired total for any of these categories and none is
derivable — the narrated episodes are samples, and John 21:25 closes by saying
so. Three things follow, and they are the difference between a useful number
and a false one:

- `COVERAGE_TOLERANCE` (20%) means a count has to be *clearly* out before
  anything reports it as out. Flagging 34 parables against a band of 35-40
  would claim the catalogues agree to the unit, and they do not.
- A fill run aims at the **middle** of a band, not its floor, so no category
  lands at a thin edge that carries no more authority than any other point.
- No test asserts a category is *in* its band. The one test that touches the
  seed corpus asserts the hand-authored categories are not on the short list —
  so adding a 21st act of compassion cannot fail CI, which would be exactly the
  wrong incentive.

`bun run jesus:coverage` prints count against band for the seed corpus and for
live facets; `--seed` works with no database. `bun run jesus:extract` now
defaults to **whatever is clearly short** rather than to the empty categories,
drops a type once it reaches the middle of its band, and applies a
per-event-per-type cap (`--cap=`, default 3) so a category cannot come to mean
"the Olivet discourse, forty times". `--types=empty` restores the original run.

### What the seed corpus could close, and what it could not

| Category | before | after | how |
| --- | ---: | ---: | --- |
| Compassion | 11 | **17** | six authored facets |
| Confrontations | 14 | **18** | three authored facets + one missing episode |

Checked against the reader's own lists, **every episode they named already
existed in the corpus** bar one — the plot to kill Him after Lazarus (John
11:45-53), now added. The categories were thin because most episodes carry a
single facet, not because episodes were missing.

Closing the rest from the seed file is blocked by the harmony-key constraint:
a second facet can only attach to an episode that already has a harmony key,
because the projection derives a standalone event's slug from its lead entry's
slug. Giving a standalone entry a harmony key to hang a second facet off it
moves its event from `/jesus/event/<slug>` to `/jesus/event/event-<key>` and
orphans the old row. So of the reader's compassion list, six could take a
second facet and nine could not (the deaf man, Bethsaida, the bent-over woman,
the ten lepers, Malchus, the man born blind, Thomas, the anointing woman,
Peter's restoration — all standalone events).

Two more were dropped for the §7 rule rather than the constraint: a
confrontation facet on `greatest-commandment` or `lord-of-sabbath` would become
those clusters' first *action* entry and rename the event on a fresh database.

**Extraction has neither problem** — it writes facets against an event id, so
it needs no harmony key and cannot move a URL. That is the tool for the
remaining gaps, and it is why the fix here is the pipeline's defaults rather
than more hand-authoring.

### Still short, and what closes each

| Category | now | roughly | closes with |
| --- | ---: | --- | --- |
| Questions | 27 | 300-310 | extraction; counts every interrogative, repetitions included |
| Teachings | 29 | 60-80 | extraction |
| Claims | 20 | 50-70 | extraction |
| Commands | 28 | 50-60 | extraction, then a pass to drop situational imperatives |
| Encounters | 26 | 50-60 | extraction |
| Warnings / Prayers / Prophecies | live only | 40-50 / 20-25 / 30-40 | re-run under the cap; level-1 rows are `provenance = 1`, so the current over-fill can be trimmed without touching curated content |

All of these need `bun run jesus:extract -- --apply` against a real database
with a provider key. The mechanism is in place and unit-tested; the run is not
something a content change can do for itself. Step-by-step instructions for
that run, including trimming the over-filled categories and the editorial pass
Commands needs afterwards, are in
[`docs/runbooks/fill-jesus-categories.md`](runbooks/fill-jesus-categories.md).

Landing a few either side of any of these numbers is the expected outcome, not
a miss.

**One caveat on Commands.** The 50-60 target is *enduring* commands. Extraction
counts every imperative, so "stretch out your hand" and "go, show yourself to
the priest" — real imperatives addressed to one person in one moment — will
come through alongside "love your enemies". Reaching 50 is not the same as
reaching the right 50, and that pass is editorial.
