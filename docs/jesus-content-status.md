# Jesus corpus — what's seeded, what's missing, what needs work

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

### P0 — Three "Popular Studies" render empty (regression)

`every-question-jesus-asked`, `every-miracle-of-jesus` and
`every-parable-of-jesus` have **zero curated members**. They were never meant to:
each defines a dynamic filter (`{"kind":"QUESTION"}` etc.) stored on the
collection row.

The **entry-era** service resolved that filter — `jesus.service.ts` still carries
the comment *"resolving a collection's membership (dynamic filter vs. curated
list)"* and the code to do it. The **event-era** path does not:
`getEventIdsForCollection` reads `jesus_collection_events` only, and that table is
populated exclusively from curated `jesus_collection_entries`. No curated rows →
no event rows → an empty list.

So three of the nine studies are dead pages today, and they are three of the most
prominent ones on the hub. This is a code fix, not a seeding one: teach the event
collection path to resolve a stored filter, the way the entry path did.

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

69 of the 144 word facets carry no words. A parable renders as a title and a
summary with nothing said in it — which is a strange thing for a parable to be.
This is the single biggest content gap by user-visible impact, and it's exactly
the category the hub advertises most heavily (40 parables).

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
| 1 | Resolve dynamic collection filters in the event path | Code | 3 dead studies |
| 2 | Add quotes to 40 parables + 28 teachings | Authoring | The largest browse category |
| 3 | Re-type existing healing miracles as `HEALING` | Data pass | 1 empty category |
| 4 | Run `jesus:generate` for overviews, review, then the rest | Pipeline | Summary, Compare prose |
| 5 | Author Promise / Warning / Prayer / Prophecy entries | Authoring | 4 empty categories |
| 6 | Place the 5 unplaced entries; verify the 2 non-Gospel refs | Data pass | Timeline completeness |
| 7 | Populate `unique_to_account` per passage | Authoring | Compare becomes useful |
| 8 | Extract level-1 facets from supplied passage text | Pipeline | Provenance means something |
| 9 | Assess chronology confidence per event | Review | Confidence means something |
| 10 | Fill reveals / reactions / people / location | Authoring | Event page depth |

Items 1, 3 and 6 are small and mechanical. Item 2 is the biggest single win and
is pure authoring. Item 4 needs a provider key and a reviewer.

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
