# Jesus Event Graph — Feature Specification

**Status** Draft for review · **Date** 17 Aug 2026
**Supersedes** the single-`kind` model shipped in verse-mate#309
**Reviewers** Engineering · Content/Theology · Design

> A rendered version of this document is published as an artifact for sharing.
> This file is canonical; amend it here.

---

## 1. The one decision

**The primary object is the Gospel event — the pericope — not the verse and not the category.**

Jesus' words, actions, questions, commands, claims, promises, warnings and prayers are
*facets extracted from an event*. Every browse category in the product is a *saved view
over the graph*, not a separate collection with its own rows.

> **The principle.** A user can start anywhere — a verse, a parable, a topic, a miracle,
> a question, a chronological stop — and land on the same underlying event. That is what
> makes the feature feel like one product rather than ten collections that happen to
> share a tab.

One event belongs to many categories at once, and that is the normal case. The rich young
ruler is simultaneously an encounter, a teaching, three questions, two commands, a
teaching on wealth and a teaching on salvation. A single `kind` column cannot express
that; an event with typed facets can.

## 2. Why: the failure mode we're avoiding

This is not theoretical. The corpus shipped in verse-mate#309 has 231 entries each
carrying a single `kind`, grouped loosely by a `harmony_key` string. Measuring it:

| Measure | Count | What it means |
| --- | ---: | --- |
| Entries | 231 | Each forced into exactly one category |
| Distinct harmony clusters | 78 | Proto-events, expressed as a bare string |
| Clusters holding more than one entry | 20 | **Already duplicate cards of one episode** |
| Entries with more than one Gospel reference | 121 | Cross-Gospel data already exists and is usable |

Those 20 clusters are the bug made visible. Today `storm-stilled` renders as two
unrelated cards:

- **Calming the storm** — filed under Miracles
- **"Why are you afraid, O you of little faith?"** — filed under Questions

Same boat, same night, same sentence — the question is what Jesus said *during* the
miracle. The product shows them as two things and cannot link them, because there is no
object that is "the event".

Other clusters with the same problem: the cleansed leper (miracle + compassion), the
withered hand (miracle + confrontation), the bleeding woman (miracle + question), the
Gerasene demoniac (miracle + compassion), Lord of the Sabbath (claim + teaching).
Promoting the cluster to a real object fixes all twenty at once.

## 3. Where we are today

| Asset | State | Disposition |
| --- | --- | --- |
| **Parables** (Topics feature, `PARABLE` category) | Shipped; grouped across Gospels via reference markdown | **The prototype.** Becomes one facet type on the event graph; keeps its URLs |
| **Jesus corpus** (verse-mate#309, merged) | 231 entries, 428 normalized references, 10 themes, 10 periods, 9 studies | **Keep the content, change the shape** (§13) |
| **Jesus tab UI** (verse-mate-web#278) | Hub, timeline, browse lists, entry detail; renders entirely from the API | **Keep the shell, replace the leaf.** Entry detail becomes the event page |

The important property of the shipped UI is that it hardcodes none of the taxonomy — the
hub renders from `GET /jesus/overview`. Moving to events changes what the API returns,
not how the hub is built.

## 4. Data model

### The event

```
JesusEvent {
  id, slug, title
  // Where it sits in each Gospel — canonical, not harmonized
  passages: [{ gospel, book_id, chapter, verse_start, verse_end,
               canonical_order, is_primary }]
  // Where we think it sits in history — separate, and hedged
  chronology: { sequence, period, approximate_date?, location?,
                confidence: high | probable | disputed }
  parallel_confidence: high | probable | disputed

  people: [], audience: [], setting: {}
  themes: []

  facets: JesusFacet[]        // words + actions
  reactions: [{ who, what, passage_ref }]
  reveals: {
    says_about_himself: [],   // explicit, from Jesus' own speech
    demonstrates: [],         // inferred from action — level 2
    others_say: [],           // Peter, demons, crowds, the Father…
    narrator_says: []         // the Gospel writer, not Jesus
  }

  interpretation: { summary, significance, theological_themes }
  language_insights: []
  application_questions: []
  context: { before: [], after: [] }
}
```

### The facet

One row per thing Jesus said or did. This is where the product's categories come from.

```
JesusFacet {
  event_id
  mode: WORD | ACTION
  type: TEACHING | PARABLE | QUESTION | COMMAND | CLAIM
      | PROMISE | WARNING | PRAYER | PROPHECY            (WORD)
      | MIRACLE | HEALING | ENCOUNTER | COMPASSION
      | CONFRONTATION | SYMBOLIC_ACTION                  (ACTION)
  // Distinguish who is speaking from who is acting.
  speaker: JESUS | DISCIPLE | CROWD | OPPONENT | NARRATOR | FATHER
  actor:   JESUS | …
  passage_ref, text_ref
  provenance: 1 | 2 | 3
  themes: []
}
```

**Why `actor` is separate from `speaker`.** Tagging only `speaker = Jesus` produces a
red-letter list. Tagging `actor = Jesus` as well recovers the theology a red-letter view
discards. Mark 1:40–42 yields four action facets — *felt compassion*, *stretched out His
hand*, *touched him*, *healed him* — none of which are speech, and the middle two of
which are the point of the passage.

### Tables

`jesus_events` · `jesus_event_passages` · `jesus_facets` · `jesus_event_themes` ·
`jesus_event_people` · `jesus_event_reactions` · `jesus_event_reveals` ·
`jesus_event_interpretations` · `jesus_event_links` (before/after) · plus the existing
translation and explanation tables, repointed from entry to event.

## 5. Provenance: every claim answers "how do you know that?"

Three levels, stored per assertion, surfaced in the UI.

| Level | Contains | Example |
| --- | --- | --- |
| **1 · Scripture** | Only what is explicitly present in the supplied biblical text | Jesus touched the leper (Mark 1:41) |
| **2 · Interpretation** | Reading of the passage in its own context | The touch demonstrates willingness to approach someone ceremonially unclean |
| **3 · Synthesis** | Theological conclusion drawn across passages | Jesus' holiness is not contaminated by uncleanness; His purity overcomes it |

**Hard rule for extraction:** level 1 fields may contain only information explicitly
present in the passage handed to the model. Inference goes in a different field, or it is
rejected by validation (§11).

## 6. Chronology: two orderings, never conflated

The Synoptics sometimes arrange material thematically. Where Matthew places an event and
when it happened are different questions.

- **Canonical order** — where each Gospel actually puts the event. A fact. Stored per passage.
- **Harmonized chronology** — our best reconstruction of historical sequence. A judgement.
  Stored on the event with a confidence label.

Where confidence is not `high`, the UI says so plainly next to the timeline position —
*"Chronological placement: probable"*. Parallel identification carries its own separate
confidence, because two accounts being the same event is also sometimes disputed.

> **Sequencing consequence.** Build parallel-event mapping *first*, chronology *second*.
> Parallels are largely determinable from the text; chronology is a reconstruction that
> depends on the parallels already being settled. Doing it the other way round bakes
> disputed sequencing into the foundation.

## 7. Categories as views

No category owns rows. Each is a query, which is why an event can appear in several
without duplication.

| Surface | Resolves to |
| --- | --- |
| Parables | `facet.type = PARABLE` |
| Miracles / Healings | `facet.type IN (MIRACLE, HEALING)` |
| Questions Jesus asked | `facet.type = QUESTION AND speaker = JESUS` |
| Every command | `facet.type = COMMAND AND speaker = JESUS` |
| Every time Jesus prayed | `facet.type = PRAYER AND speaker = JESUS` |
| What He claimed about Himself | `facet.type = CLAIM` ∪ `reveals.says_about_himself` |
| Everyone Jesus healed | `facet.type = HEALING` joined to `event_people` |
| Follow His Life | events ordered by `chronology.sequence` |
| Explore by topic | events ∪ facets joined to `themes` |
| Popular studies | a saved query, or a curated ordered event list |

**On counts.** "307 questions Jesus asked" is a claim about our methodology, not a fact
about scripture. Totals depend on how parallel accounts and compound statements are
classified. Wherever the product shows a count, it links to a short note explaining the
counting rule. We publish our methodology rather than borrowing a number from a list on
the internet.

## 8. API surface

```
GET  /jesus/overview              hub skeleton — sections, counts, themes, studies
GET  /jesus/events                facets AND-ed: type, mode, theme, period,
                                  person, audience, gospel, q
GET  /jesus/events/:slug          the full event object
GET  /jesus/events/:slug/compare  the four-Gospel synopsis, from stored data
GET  /jesus/life                  chronological walk, with confidence labels
GET  /jesus/topics/:slug          "what Jesus said about X" — words + deeds + themes
GET  /jesus/for-passage           ?book_id=41&chapter=4&verse=39
                                  → the event(s) covering this verse
```

`/jesus/for-passage` is load-bearing for §9 — it turns ordinary reading into an entry
point, and must be fast enough to call on every chapter render.

## 9. Experience

### The Jesus home

Three primary ways in, in this order: **Follow His Life** (narrative), **His Words**
(teachings · parables · questions · commands · claims · promises · warnings · prayers),
**His Actions** (miracles · healings · encounters · compassion · confrontations ·
symbolic actions). Then *Explore by topic*, then *Popular studies*. This is the shell
already shipped in verse-mate-web#278; it needs new categories, not a new layout.

### The event page — the centre of the system

```
Jesus Calms the Storm
Matthew 8:23–27 · Mark 4:35–41 · Luke 8:22–25        [MT][MK][LK][ jn ]

Overview | Words | Actions | Compare | Insights
```

- **Overview** — setting, people, what happens, what it reveals.
- **Words** — every utterance of Jesus in this event, typed as command / question /
  teaching / claim / promise / warning / prayer. Verse text is retrieved through
  VerseMate's existing translation rights, not embedded in generated content.
- **Actions** — what Jesus did, in sequence. The tab no other Bible app really offers.
- **Compare** — the four-column synopsis: what each Gospel includes, what it emphasizes,
  what is unique to one account. **Generated from the stored dataset and validated —
  never invented live by a model at request time.**
- **Insights** — interpretation, original-language notes where genuinely useful,
  application questions. Everything here is level 2 or 3 and labelled as such.

### Observation → Interpretation → Application, embedded

Not a separate study mode — the shape of the event page itself. **Observe** (~80%, the
Overview/Words/Actions/Compare tabs), **Understand** (~15%, Insights), **Apply** (~5%, a
short set of questions asking what the passage requires — what to believe about Christ,
what response is expected, what assumption He contradicts). Not "how does this make you
feel?".

### The connection from ordinary reading

The highest-leverage piece of the feature. While reading Mark 4:39, an unobtrusive inline
affordance:

> **View Jesus Event →**
> Jesus Calms the Storm · also in Matthew 8:23–27 and Luke 8:22–25

The reader never has to leave the reading flow to discover the richer layer, and parallel
accounts surface exactly when relevant. Requirement: must not disrupt verse selection,
highlighting or existing tap targets.

### "What does Jesus say about…"

A topic query returns words, deeds and themes together, which is what makes it more useful
than keyword search. For *anxiety*: the teaching (Matthew 6:25–34), the question inside it
(6:27), the command, **and the related actions** — calming the storm, feeding the crowds —
plus the connecting themes (trust · the Father's provision · kingdom priorities). Then a
short synthesis, labelled level 3.

## 10. Desktop & mobile

The event page carries five tabs and a four-column comparison. Those are the two things
that break on a phone, so they are specified explicitly.

| Element | Mobile (<768px) | Desktop (≥1024px) |
| --- | --- | --- |
| Event tabs | Horizontally scrollable segmented control, sticky under a condensed event header | Inline tab row; header always visible |
| Compare | Stacked per-Gospel accordions (MT·MK·LK·JN) with a "unique to this account" marker; no horizontal table | True four-column synopsis with shared/unique rows; columns narrow to Gospels that contain the event |
| Words / Actions | Single column; type chips wrap | Two columns where facet count justifies it |
| Life timeline | Vertical rail; period pills scroll horizontally | Vertical rail in a centred reading column; period nav in a sticky side rail |
| Reading link | Inline chip under the verse; opens the event full-screen | Opens in the right panel beside the text, so the passage stays visible |
| Hub | Single-column cards | Two-up grid for Words/Actions; hero for Follow His Life |

Tap targets stay ≥44px. Every list virtualizes past ~100 rows — "every question Jesus
asked" is a long list on a phone.

## 11. Content pipeline

No model generates the master dataset from scratch and ships it. Each stage is separately
reviewable, and the output is versioned.

```
Scripture
   ↓  deterministic verse segmentation
Pericope boundaries
   ↓  Gospel pericope mapping
Parallel account identification        ← settle this before chronology
   ↓  AI structured extraction (strict JSON, passage supplied — not recalled)
Facets: words · actions · questions · commands · claims · reactions
   ↓  rule-based validation
   ↓  cross-Gospel comparison
   ↓  human theological review
Versioned canonical dataset
```

### Extraction contract

```json
{ "jesus_words": [], "jesus_actions": [], "audience": [],
  "commands": [], "questions": [], "claims": [], "reactions": [],
  "explicit_ot_references": [], "interpretive_notes": [] }
```

Extraction fields may contain **only** information explicitly present in the supplied
text. Anything inferred goes in `interpretive_notes` and is stored at level 2. Validation
rejects a record whose level 1 fields contain a reference not present in the passage, a
speaker not named in the text, or a quotation that does not match the source.

## 12. Build order

Ordered so each phase forces the model to become robust before the next depends on it.
Miracles and encounters come before words because they make the *actions* dimension real —
and actions are the part the schema most needs to prove out.

1. **Event ontology & pericope mapping** — define event boundaries across all four
   Gospels. Deterministic where possible. Output: the node list.
2. **Parallel account mapping** — link accounts into events, with confidence. The asset
   everything else hangs off. Parables validate the approach; they are already grouped.
3. **Parables migrated onto the graph** — the existing implementation becomes facets of
   events. Proves migration without new content risk. URLs preserved.
4. **Miracles & healings** — first real actions dimension. Forces `actor`, reactions and
   symbolic action to work.
5. **Encounters** — forces people, audience and multi-category events (the rich young
   ruler is the test case).
6. **Words extraction** — teachings, questions, commands, claims, promises, warnings,
   prayers, prophecies across the mapped events.
7. **Event pages** — Overview · Words · Actions · Compare · Insights, both breakpoints.
8. **Verse → event linking** — `/jesus/for-passage` plus the in-reader affordance. The
   moment the feature starts compounding.
9. **Thematic exploration** — "What does Jesus say about…" over words + deeds + themes.
10. **Chronology** — harmonized sequence with confidence labels. Deliberately late.
11. **AI synthesis** — level 3 material, only once the structured layer can ground it.

## 13. Migration from what has shipped

verse-mate#309 is merged. Its 231 entries are **content we keep** — the shape changes, the
research does not. The conversion is largely mechanical because the corpus already
clusters by `harmony_key`.

| Shipped | Becomes | Notes |
| --- | --- | --- |
| `harmony_key` cluster (78) | `jesus_events` row | The proto-event is promoted to a real object |
| Entry with an event-like kind (127) | Event + its action facet | MIRACLE · ENCOUNTER · PARABLE · CONFRONTATION · COMPASSION |
| Entry with a word-like kind (104) | Word facet on an event | Those in a cluster attach to it; the rest seed a new single-account event |
| `jesus_entry_references` (428) | `jesus_event_passages` | Already normalized to book/chapter/verse. Direct carry-over |
| Themes (10) & studies (9) | Unchanged | Re-pointed from entry to event. Add PROMISE, PRAYER, WARNING, PROPHECY, HEALING, SYMBOLIC_ACTION as facet types |
| `LIFE_TIMELINE` (226 placements) | `chronology.sequence` | Every placement gains a confidence value; default `probable` pending review |

**Note on today's themes.** `prophecy` and `warnings` currently exist as *themes*. Under
this model they are facet *types* — a warning is a kind of thing Jesus said. They need
reclassifying, and a theme may legitimately keep the same name.

**Recommendation on verse-mate-web#278.** Merge it. The hub, timeline, browse lists and
reading integration all survive; only the entry detail screen is replaced by the event
page. Shipping the shell now gets the navigation in front of users while the graph is
built underneath it.

## 14. Open decisions

- **Event granularity.** Roughly 300–400 events depending on how finely narratives divide.
  Where do we cut the Sermon on the Mount — one event, or one per pericope? This decision
  drives every count in the product.
- **Who signs off level 2 and 3 content?** The pipeline requires named human theological
  review. Identify that person or panel *before* extraction starts.
- **John's discourses.** They resist pericope segmentation. Longer-form event type, or
  accept larger events for John?
- **Infancy and post-resurrection material.** Currently out of the corpus because it is
  about Jesus rather than words/actions *of* Jesus. Include as events with no Jesus
  facets, or leave the timeline honestly sparse at both ends?
- **Do we show disputed harmonizations at all,** or hide anything below `probable`?
- **Mobile app parity.** This spec assumes mobile consumes the same API. Confirm the
  timeline against the mobile roadmap.

## 15. Risks & non-goals

### Risks

- **Content volume is the schedule.** The engineering is weeks; the reviewed dataset is
  the long pole. Phase order is designed so something ships at each stage.
- **Extraction quality degrades quietly.** Mitigated by validation gates that fail a
  record rather than downgrade it, and by level-1 assertions being automatically
  checkable against the text.
- **False precision.** A confident-looking timeline implies scripture specifies sequence.
  Confidence labels are a product requirement, not a nicety.
- **Scope creep into a commentary.** Level 3 synthesis is capped and always labelled.

### Non-goals

- A red-letter search. If the output could be produced by filtering on `speaker = Jesus`,
  we have built the wrong thing.
- Live model generation of Compare differences at request time.
- Resolving disputed harmonization questions. We label them; we do not adjudicate them.

## 16. Success measures

- **Coherence:** from any entry point — verse, parable, topic, miracle, question, timeline
  stop — a user reaches the same event in one tap. Measurable as a graph property.
- **The reading bridge is used:** share of Gospel chapter reads that open an event via the
  in-reader link.
- **Cross-Gospel discovery:** share of event sessions that open the Compare tab.
- **Actions are read, not just words:** Actions tab engagement relative to Words. If
  Actions goes unread, the differentiating bet has not paid off.
- **Zero unattributed assertions:** every level 2 and 3 statement in production carries its
  level and its source event.
