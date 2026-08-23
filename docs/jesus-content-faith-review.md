# Jesus content — review against the statement of faith

Reviewed: the Jesus feature as it stands after #309–#323 — the seed corpus, the
prompt templates every generated layer is written against, the validation gates,
the browse taxonomy, and the web client's copy.

Measured against the seventeen tenets supplied for this review (scripture and
inerrancy · Trinity · total depravity · substitutionary atonement and bodily
resurrection · salvation by faith alone · imminent physical return · the church ·
eternal security · baptism · the Lord's Supper · heaven and hell · evil, Satan
and demons · rewards · spiritual gifts · women in ministry · the Christian life ·
stewardship).

**Summary.** Nothing in the corpus contradicts a tenet. The problems are the
other kind: what the framework inherits, what the corpus is silent about, and
what has already reached readers without anyone checking it.

---

## 1. Scope — and the part of the content this review could not reach

The Jesus feature deliberately carries no theology of its own. Both prompt
migrations say so in their headers: the framework "comes from the existing
`prompts` row with `prompt_type = 'system'` — the same one behind every other
explanation in VerseMate."

| Layer | Where it lives | Reviewed here |
| --- | --- | --- |
| 233 seed entries — titles, summaries, quotes, collections, timeline | `packages/database/src/seeds/data/jesus.data.ts` | ✅ in full |
| Task prompts for overview / compare / insights / application / extraction | `packages/database/migrations/20260817140000-add-jesus-event-prompts.ts` | ✅ |
| Topic-brief prompt | `packages/database/migrations/20260823130000-add-jesus-topic-brief-prompt.ts` | ✅ |
| Enrichment prompt (reveals, reactions, people, location) | `packages/backend-base/src/jesus/scripts/enrich-jesus-events.ts` | ✅ |
| Browse taxonomy, category blurbs and intros | `packages/backend-base/src/jesus/jesus.constants.ts` | ✅ |
| Validation gates | `packages/backend-base/src/jesus/utils/generation-validation.ts` | ✅ |
| Web copy | `verse-mate-web/src/components/jesus/**`, `src/lib/jesus*.ts` | ✅ |
| **828 generated explanations · 466 extracted facets · 885 reveals · 791 reactions** | **production database only** | ❌ **not reviewable from the repo** |

That last row is the majority of what a reader actually sees, and it is not in
version control. See finding F6.

---

## 2. Verdict by tenet

| # | Tenet | Verdict |
| --- | --- | --- |
| 1 | Authority and inerrancy of scripture | ⚠️ Strong mechanically; quotation accuracy is uneven (F8) |
| 2 | The Trinity | ⚠️ The one explicit Trinitarian saying is elided (F3); Spirit near-absent |
| 3 | Total depravity | ✅ Well represented |
| 4 | Substitutionary atonement and bodily resurrection | ❌ Resurrection yes; **atonement absent** (F2) |
| 5 | Salvation by faith alone | ✅ Well represented |
| 6 | Imminent physical return | ✅ Well represented |
| 7 | The church | ➖ Little occasion in a Gospels corpus; no conflict |
| 8 | Eternal security | ⚠️ Its key dominical text is not surfaced (F4) |
| 9 | Baptism | ⚠️ Present, but the commission text is truncated (F3) |
| 10 | The Lord's Supper | ✅ Remembrance and symbol; no sacramentalism |
| 11 | Heaven and hell | ⚠️ Corpus is faithful; **the inherited framework is weaker than the tenet** (F1) |
| 12 | Evil, Satan and demons | ✅ Treated as real personal agents |
| 13 | Rewards | ✅ Well represented |
| 14 | Spiritual gifts | ➖ Outside a Gospels corpus; no conflict |
| 15 | Women in ministry | ✅ No office claim made anywhere |
| 16 | The Christian life | ✅ Well represented |
| 17 | Stewardship | ✅ Well represented |

---

## 3. Findings

### F1 — The framework the Jesus content inherits does not match these tenets

Because the Jesus prompts carry no theology of their own, every generated layer
is written against the `system` prompt seeded in
`packages/backend-base/src/bible/seed.ts`. Three things in that row diverge from
the tenets above:

- **Hell** (`seed.ts:300`) — "Hell: final judgment for the unsaved, as described
  in Scripture (e.g., Matthew 25:46; Revelation 20:14–15)". Tenet 11 says
  *eternal conscious punishment*. "Final judgment" is wording that a conditional
  immortality or annihilationist reading satisfies just as comfortably as the
  tenet does. The tenet's distinguishing phrase is not there.
- **Named theologians** (`seed.ts:216`) — "Use theology consistent with Chuck
  Swindoll, Howard Hendricks, Charles Spurgeon, Tim Keller and Ellen G. White."
  Four of those five sit inside the tenets. Ellen G. White's system does not:
  conditional immortality cuts against tenet 11, and Adventist soteriology
  against tenet 8. The instruction asks the model to be consistent with a set
  that is not internally consistent, on exactly the two tenets where the row is
  already weakest.
- **The Sabbath** (`seed.ts:308-311`) — a standing instruction to always name
  the day of observance, its origin and its theological importance whenever a
  passage mentions the Sabbath. Nothing in the seventeen tenets takes that
  position. It is not a contradiction, but it is a distinctive the tenets do not
  hold, applied automatically — and the Jesus corpus has seven Sabbath entries
  (`lord-of-the-sabbath`, `teaching-on-the-sabbath`, `healing-at-bethesda`,
  `healing-the-withered-hand`, `the-sabbath-healing-controversy`,
  `healing-the-crippled-woman`, `healing-a-man-with-dropsy`), so it will surface
  repeatedly.

This file predates the Jesus work; it is listed first because the Jesus feature
is now by far its largest consumer — 828 explanations, 466 extracted facets and
every topic brief were written against it.

**Recommendation.** Amend the `system` row so it states the tenets rather than
paraphrasing around them: restore "eternal conscious punishment" to the hell
line, and decide deliberately whether the named-theologian list and the Sabbath
section should stand. This is a doctrinal call, so it is flagged here rather than
changed.

### F2 — The atonement is missing from the corpus

The corpus is exhaustive about the miracles (38) and the parables (40) and
silent about why He died.

- No entry for the crucifixion itself. The `cross` period runs Gethsemane →
  arrest → Sanhedrin → Pilate → three sayings from the cross, and stops.
- The ransom saying (Mark 10:45) is inside `teaching-on-greatness`'s reference
  range but the entry quotes verse 26 — the servanthood half — and not verse 28.
- "This is my blood of the covenant, which is poured out for many for the
  forgiveness of sins" (Matthew 26:28) appears nowhere.
  `do-this-in-remembrance-of-me` (`jesus.data.ts:1728`) quotes the bread and
  stops before the cup.
- "It is finished" (John 19:30) appears nowhere. Neither does "I lay down my
  life... no one takes it from me" (John 10:17-18) or John 3:14-16.
- The strings *atone*, *sacrifice*, *ransom*, *redeem*, *substitut-* return zero
  matches across the whole 3,300-line corpus.
- None of the ten themes name the cross. There is a `salvation` theme, but its
  description — "Being found, forgiven, and given life" — describes the effect
  and never the means.

Tenet 4 is the pivot of the statement of faith. A corpus this thorough teaches by
proportion, and on this doctrine the proportion is zero.

**Recommendation.** Author entries for Mark 10:45, Matthew 26:28, John 19:30,
John 10:17-18 and John 3:14-16; add an event for the crucifixion itself; consider
a `cross` theme so the material has somewhere to gather. This is the single
highest-value content change in this review.

### F3 — The Great Commission quote elides the Trinitarian formula

`make-disciples-of-all-nations` (`jesus.data.ts:1722`):

> "Go therefore and make disciples of all nations, baptizing them… teaching them
> to observe all that I have commanded you."

The ellipsis removes "in the name of the Father and of the Son and of the Holy
Spirit" — the most explicit Trinitarian sentence Jesus speaks, and the text that
carries tenets 2 and 9 together. It is elided in favour of the clause on either
side of it.

This matters more than a single quote would normally, because the Trinity has
almost no other anchor in the corpus: "Spirit" occurs twice in 3,300 lines, both
in passing (`jesus.data.ts:111`, `2255`). The Father is well covered
(`what-he-said-about-god` gathers twelve entries); the Son is covered by the whole
feature; the Spirit is not covered at all.

**Recommendation.** Restore the clause. Consider entries for John 14:16-17,
John 16:13-15 and Matthew 12:31-32.

### F4 — Eternal security's key dominical text is not surfaced

Tenet 8's clearest saying from Jesus is John 10:28-29 — "no one will snatch them
out of my hand." It falls inside `i-and-the-father-are-one`'s reference range
(John 10:22-33) but is not quoted, and neither Good Shepherd entry reaches it
(both stop at John 10:11-18). Nothing in the corpus contradicts tenet 8; nothing
states it either.

### F5 — The Incarnation period is an empty shell

`JESUS_PERIODS` defines `incarnation` — "The Word becomes flesh. Angels announce
Him, a virgin bears Him, shepherds and magi find Him, and a king tries to kill
Him" (`jesus.data.ts:92-99`) — and `LIFE_TIMELINE` has no `incarnation` key.
Zero of 233 entries are placed there. "Follow His Life" opens on a chapter with
nothing in it.

The spec records the reason (§14: infancy material is out of scope because it is
about Jesus rather than words and actions *of* Jesus), but the period ships to
the reader anyway. The incarnation and the virgin birth are load-bearing for
tenets 2 and 4, and this is the one place the product promises them by name.

**Recommendation.** Either populate the period — Luke 1:26-38, Luke 2:1-20,
Matthew 1:18-25, John 1:1-18 as events with no Jesus facets — or drop the period
until it has content. Leaving a named empty chapter is the worst of the three.

### F6 — The bulk of the content is live, unreviewed, and outside this repo

The spec's own pipeline (§11) puts **human theological review** between
validation and the "versioned canonical dataset", and §14 says to identify that
reviewer or panel *before* extraction starts. `docs/jesus-content-status.md` §6,
under "Still open", records what actually happened:

> **Nothing is reviewed.** `reviewed_by` / `reviewed_at` remain null on every
> generated row.

828 explanations, 466 level-1 facets, 885 reveals and 791 reactions are in
production, none of them checked against any statement of faith by a person, and
none of them in version control. This review covered the prompts that produced
them, which is not the same thing: a prompt is a constraint, not a guarantee.

**Recommendation.** Export a representative sample — say every `insights` layer
(the interpretation tab) and every `SAYS_ABOUT_HIMSELF` reveal — and review that
against the tenets before the next generation run. Then answer the question the
spec left open about who signs off.

### F7 — Reveals were generated with no statement of faith in context *(fixed on this branch)*

`enrich-jesus-events.ts` passed `ENRICH_INSTRUCTIONS` as the model's
`instructions` and never loaded the `system` prompt. Every other generation path
in the feature does the opposite: `JesusGenerationService` puts the framework in
`instructions` and the task in `input`, precisely so — in its own words — "the
feature should not read as though a different theology wrote it."

The enrichment path is the most doctrinal surface in the whole feature. Its
`reveals` key asks the model for "what the event discloses about who Jesus is",
split into four channels, and the web client renders them under "What He says
about Himself", "What He demonstrates", "What others say" and "What the narrator
says". All 885 rows behind those headings were written without the statement of
faith in context.

Fixed here: the script now loads the framework through
`JesusGenerationService.getSystemPrompt()`, passes it as `instructions`, moves
the task description into `input`, and exits with a clear message if no active
`system` row exists — the same precondition `jesus:generate` already enforces.
**The 885 existing rows predate the fix and should be regenerated** (`bun run
jesus:enrich -- --apply` replaces rather than appends, so a re-run converges).

### F8 — Two translations sit side by side, and only half the quotes were verified

`propose-jesus-quotes.ts` verifies every quote it proposes verbatim against the
`verses` table (`BIBLE_VERSION = "NASB1995"`), and rejects anything that is not a
literal substring. That is a genuinely strong guard on tenet 1 — but it only ran
over its own proposals, the 68 parable and teaching quotes added in the recent
authoring pass. The 75 hand-authored Claim, Command and Question quotes predate
it, read as ESV, and were never machine-checked.

The result is two translations on one screen, and an unchecked half. Visible
symptoms:

- `i-am-the-bread-of-life` (`jesus.data.ts:1070`) gives John 6:35 as "I am the
  bread of life; whoever comes to me shall not hunger." — a partial sentence
  closed with a full stop; the verse continues "and whoever believes in me shall
  never thirst."
- `the-greatest-commandment` elides "and with all your soul and with all your
  mind" without marking where the ellipsis lands relative to the verse split.
- `the-olivet-discourse` (`jesus.data.ts:2146`) carries a stray leading curly
  quote inside the quote field.

The topic-brief prompt sets the right standard already — "Quotation marks are a
claim that He said those exact words" — and the seed corpus should be held to it.

**Recommendation.** Run the existing verifier over all 233 entries rather than
only the ones it proposed, and settle on one version for the corpus.

### F9 — One summary reads as commending the dishonesty

`parable-of-the-shrewd-manager` (`jesus.data.ts:827`): "A dishonest steward buys
himself a future. Use worldly wealth the way he used his last week of access."
The imperative attaches to the manager's dishonesty rather than to his foresight.
A few words' rewording.

---

## 4. Where the content is strong

Worth recording, because it is most of the corpus:

- **Exclusivity is never softened.** `i-am-the-door` — "Not one way among several
  into the fold — the way in" (`jesus.data.ts:1091`); John 14:6 quoted whole;
  the narrow gate kept as two roads and two destinations.
- **The deity claims are kept sharp**, not hedged: `before-abraham-was-i-am`
  ("He took the divine name for Himself"), `i-and-the-father-are-one`,
  `i-am-before-the-high-priest`.
- **Total depravity** is stated exactly as tenet 3 frames it —
  `you-must-be-born-again`: "the kingdom is not entered by improvement but by
  birth" (`jesus.data.ts:2097`).
- **Hell is not softened in the corpus**, whatever the framework says.
  `teaching-on-hell-and-judgment` quotes Matthew 25:46 — "These will go away into
  eternal punishment" — and its summary calls it "not a metaphor He softens"
  (`jesus.data.ts:2287-2293`). The corpus is closer to tenet 11 here than the
  `system` prompt is.
- **The Lord's Supper** is remembrance and new meaning, with no drift toward
  sacramentalism (tenet 10).
- **Satan and demons** are treated as real personal agents throughout —
  the temptation, the Beelzebul exchange, `get-behind-me-satan`,
  `you-are-of-your-father-the-devil` (tenet 12).
- **Grace against merit** is everywhere: the workers in the vineyard, the
  Pharisee and the tax collector, the prodigal, the two debtors (tenet 5).
- **The resurrection is physical**, not spiritualised: the wounds offered to
  Thomas, breakfast on a beach, a body that was buried and is not there.
- **Women are honoured without an office claim.** The corpus makes the first
  resurrection witness a woman and gives the Samaritan woman the longest recorded
  conversation, and nowhere asserts an elder or overseer role (tenet 15).
- **The mechanical gates are a real guard on tenet 1.** A quotation that is not a
  literal substring of the supplied passage is rejected rather than downgraded;
  a citation outside the event's own accounts fails the scope gate; the four
  reveal channels are kept apart, in the client's own words, "so His claims are
  never merged with other people's."

---

## 5. What changed on this branch

Only F7 — the one finding that is a code defect rather than a doctrinal or
editorial call.

- `packages/backend-base/src/jesus/services/jesus-generation.service.ts` —
  `getSystemPrompt()` made public, with a note on why the enrichment path needs
  it.
- `packages/backend-base/src/jesus/scripts/enrich-jesus-events.ts` — loads the
  framework, passes it as `instructions`, moves `ENRICH_INSTRUCTIONS` into
  `input`, and fails fast when no active `system` row exists.

Everything else in this review is left for a decision: F1 amends a statement of
faith, F2–F5 and F9 are authoring, F6 is governance, F8 needs a version decided
before it can be run.
