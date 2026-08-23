# Runbook — fill the thin Jesus categories

Brings the browse categories up to their coverage bands. Run this when
`jesus:coverage` reports categories as clearly short, or clearly over.

The corpus is not missing episodes. It is missing *facets* — one episode
usually carries a single one, so a category's count reflects how many episodes
were typed into it rather than how much the Gospels give it. Extraction is what
closes that, and it has already found the content: a previous run proposed
2,781 facets and wrote 466 of them, because `--types` was pinned to the five
categories that were empty at the time. Everything else it found was discarded.

**What this run is expected to do**

| Category | now | roughly | notes |
| --- | ---: | --- | --- |
| Questions | 27 | 300-310 | counts every interrogative, repetitions included |
| Teachings | 29 | 60-80 | |
| Claims | 20 | 50-70 | |
| Encounters | 26 | 50-60 | |
| Commands | 28 | 50-60 | needs an editorial pass after — see §6 |
| Warnings / Prayers / Prophecies | over | 40-50 / 20-25 / 30-40 | trimmed in §5, not filled |

The bands are approximate and deliberately so. Landing a few either side of any
number is the expected outcome, not a miss — see `JESUS_CATEGORY_TARGETS` for
why. Nothing here is a pass/fail gate.

---

## 0. Stop — settle the framework first

**Do not start this run until F1 and F6 of
[`docs/jesus-content-faith-review.md`](../jesus-content-faith-review.md) have an
answer.** This is a gate, not a caution.

`extractFacets` sends the active `system` prompt as its `instructions` — the
same theological framework every other generated layer is written against. The
faith review found (F1) that this framework does not match the seventeen tenets
supplied for it, and (F6) that 828 explanations, 466 level-1 facets, 885 reveals
and 791 reactions are already live having never been checked against any
statement of faith by a person.

This runbook multiplies exactly that content. Filling Questions alone takes the
corpus from 27 to ~300 facets, all of them level 1 — the provenance that asserts
*"this is what the text says"* rather than *"this is our reading"*. Generating
several hundred more against a framework under active revision means doing the
work twice, and the second time is a deletion.

The review's own recommendation, and the spec's (§11, §14), is the order to
follow:

1. Amend the `system` prompt so the framework matches the tenets (F1).
2. Export a sample of what already exists — every `insights` layer and every
   `SAYS_ABOUT_HIMSELF` reveal — and review it against the tenets (F6).
3. Name who signs off level-1 content.
4. *Then* run this.

If steps 1–3 are not done, the correct action is to raise it, not to proceed
with a smaller `--limit`. A partial run has the same problem in miniature.

---

## 1. Prerequisites

Same access constraints as `seed-jesus-corpus.md`, plus a provider key:

- **A repo checkout**, not the container. The production image ships only
  `./dist` and `./migrations`; these scripts need the source tree.
- **Database allowlist.** The managed database restricts by trusted source, so
  whichever machine runs this has to be on it.
- **Keep `?sslmode=require`** in `POSTGRES_URL`. `getSSLConfig()` detects that
  exact substring to enable TLS with `rejectUnauthorized: false`, then strips it
  before connecting. Omit it and TLS is off and the connection is refused.
- **`OPEN_AI_KEY`**, and `AI_PROVIDER` left at its default (`openai`).
- **An active `system` prompt**, post-F1. Extraction reads it at run time and
  will happily use a stale one — there is no version check between the prompt
  the review examined and the prompt a run picks up.
- **The corpus must already be seeded.** If `jesus_events` is empty, run
  `seed-jesus-corpus.md` first — extraction reads events, it does not create
  them.

```bash
git checkout main && git pull
bun install
cd packages/backend-base
```

Every command below runs from `packages/backend-base` with `POSTGRES_URL` and
`OPEN_AI_KEY` set in the environment.

> **Note on `bun run` and flags.** The `--` before script flags is required:
> `bun run jesus:extract -- --apply`. Without it, bun eats them and the script
> sees no arguments — which silently means "dry run, default types".

---

## 2. Measure first

```bash
bun run jesus:coverage
```

Prints two tables: the seed corpus (hand-authored, level 2) and live facets
(what the browse categories actually show). `▽` is clearly short, `△` clearly
over, `·` about right.

**Record this output.** It is the before-picture, and §7 compares against it.

`--seed` skips the database entirely if you just want the corpus numbers.

---

## 3. Rehearse

Two rehearsals, in this order. Neither writes anything.

**A. Check the plan.** Without `--apply` the script reports what it would keep
and stops:

```bash
bun run jesus:extract -- --limit=5
```

Read the banner. It names each category it intends to fill, its current count,
what it is aiming at, and roughly how far it has to go. If a category you
expected is absent, it is already within tolerance of its band — that is
working as intended, not a bug.

**B. Check the shape on one event**, using a big discourse, which is where the
per-event cap matters most:

```bash
bun run jesus:extract -- --slugs=event-olivet-discourse
```

The summary line breaks down what was dropped and why: wrong type, no text,
duplicate, over the per-event cap. Expect a large `capped` number here. That is
the fix for the over-filled categories doing its job.

> **Do not use `AI_PROVIDER=stub` with `--apply`.** The stub provider returns
> placeholder content, and applying it writes placeholders into the corpus at
> level 1. Stub is for exercising the plumbing, never for a real run.

---

## 4. Fill, one category at a time

Do **not** run the bare default across everything on the first pass. Take one
category, look at what it wrote, then move on. A bad pass is reversible (§8)
but re-running costs another round of API spend.

Start with the smallest, so a mistake is cheap to inspect and undo:

```bash
bun run jesus:extract -- --types=COMPASSION --apply
bun run jesus:coverage
```

Then spot-check in the database — read ten of them and ask whether you would
have written them:

```sql
SELECT f.title, f.text, e.slug AS event
  FROM jesus_facets f
  JOIN jesus_events e ON e.event_id = f.event_id
 WHERE f.provenance = 1 AND f.type = 'COMPASSION'
 ORDER BY f.created_at DESC
 LIMIT 10;
```

If it reads well, work outward. Suggested order — cheapest and most verifiable
first, `QUESTION` last because it is by far the largest:

```bash
bun run jesus:extract -- --types=CLAIM --apply
bun run jesus:extract -- --types=ENCOUNTER --apply
bun run jesus:extract -- --types=TEACHING --apply
bun run jesus:extract -- --types=COMMAND --apply
bun run jesus:extract -- --types=QUESTION --apply
```

Run `jesus:coverage` between each. A type stops on its own once it reaches the
middle of its band, so these will not overshoot.

Once you trust it, the bare default does whatever is still short in one pass:

```bash
bun run jesus:extract -- --apply
```

**Cost.** This walks up to 207 events and asks for an extraction on each. For a
large sweep, `jesus:generate:batch` goes through the Batch API and applies the
same selection rules — the contract is shared deliberately, so batching cannot
keep a different set.

---

## 5. Trim the over-filled categories

Warnings, Prayers and Prophecies were filled without a per-event cap, so their
counts largely reflect how many verses their biggest events have. There is no
`--prune` flag; this is a deliberate, reviewed SQL step.

The fix is to apply the cap retroactively — keep the first three of a type per
event, deactivate the rest. Count first:

```sql
WITH ranked AS (
  SELECT facet_id,
         ROW_NUMBER() OVER (PARTITION BY event_id, type
                            ORDER BY created_at, facet_id) AS rn
    FROM jesus_facets
   WHERE provenance = 1
     AND is_active = true
     AND type IN ('WARNING', 'PRAYER', 'PROPHECY')
)
SELECT COUNT(*) FROM ranked WHERE rn > 3;
```

Then deactivate:

```sql
WITH ranked AS (
  SELECT facet_id,
         ROW_NUMBER() OVER (PARTITION BY event_id, type
                            ORDER BY created_at, facet_id) AS rn
    FROM jesus_facets
   WHERE provenance = 1
     AND is_active = true
     AND type IN ('WARNING', 'PRAYER', 'PROPHECY')
)
UPDATE jesus_facets f
   SET is_active = false, updated_at = NOW()
  FROM ranked r
 WHERE f.facet_id = r.facet_id
   AND r.rn > 3;
```

Three things this deliberately does:

- **`provenance = 1` only.** Curated content is never touched. Do not widen
  this predicate.
- **Deactivates, does not delete.** Reversible by flipping `is_active` back.
- **Spreads rather than truncates.** Keeping three per event preserves coverage
  across events instead of lopping off whichever facets happened to sort last.

Re-run `jesus:coverage`. If a category is still over, lower the cap to 2 and
repeat; if it lands short, `jesus:extract -- --types=WARNING --apply` tops it
back up, now under the cap.

---

## 6. The passes a script cannot do

**Commands needs an editorial review.** The band is *enduring* commands — the
~50 things Jesus tells His followers to do. Extraction counts every imperative,
so "stretch out your hand" (Matt 12:13), "go, show yourself to the priest"
(Matt 8:4) and "Lazarus, come forth" (John 11:43) will arrive alongside "love
your enemies". These are real imperatives spoken to one person in one moment,
and they are not commands to disciples.

Reaching 50 is not the same as reaching the right 50. After the Commands fill,
read the level-1 rows and deactivate the situational ones:

```sql
SELECT facet_id, title, text FROM jesus_facets
 WHERE provenance = 1 AND type = 'COMMAND' AND is_active = true
 ORDER BY created_at;
```

Matthew 28:20 — teach them "to observe all that I commanded you" — is why this
category is worth the care.

**Nothing is reviewed.** `reviewed_by` and `reviewed_at` are still null on every
generated row. Level-1 facets assert "this is what the text says", which is a
stronger claim than level 2's "this is our reading".

This is the same point §0 gates on, and it does not go away once the run
finishes. Whatever this run adds inherits the unreviewed status of everything
already there, at several times the volume. `jesus-content-faith-review.md` F6
carries the recommendation; §4 of `jesus-content-status.md` carries the open
question of who signs off. Neither is answered by running this successfully.

---

## 7. Verify

```bash
bun run jesus:coverage
```

Compare against the before-picture from §2. Expect: the eight `▽` rows resolved
to `·`, no new `△`, and the seed-corpus table unchanged — extraction writes
level-1 facets and never touches the hand-authored corpus.

Then check the app, not just the numbers:

- `GET /jesus/events/overview` — every category shows a count
- `GET /jesus/events/browse/questions` — reads like a category worth opening,
  not like one event repeated
- Open two or three events with a lot of new facets and confirm they read as
  distinct rather than as the same saying rephrased

If a category's count looks right but the content reads repetitive, the cap is
too high for that type — lower it and re-trim per §5.

---

## 8. Safety

**Reversible.** Everything extraction writes is `provenance = 1`. To undo a
whole run:

```sql
UPDATE jesus_facets SET is_active = false
 WHERE provenance = 1 AND created_at > '<the run start time>';
```

**Re-running is safe.** Facets are keyed by slug with `ON CONFLICT DO NOTHING`,
duplicates are rejected on normalised text, and the per-event cap counts what an
event already carries — so a second run does not stack another cap's worth on
the first.

**Re-seeding does not undo this.** `db:seed` and the event projection only touch
level-2 rows. They will not remove extracted facets, and extracted facets will
not be overwritten by seed edits.

---

## What is verified, and what is not

The selection logic is unit-tested: the per-event cap, that existing facets
count toward it, per-type independence, that a wordless saying is still dropped
first, and the target/tolerance arithmetic. `bun test src/jesus/`.

**The run itself has not been executed against a real database.** The defaults,
the cap and the coverage report were written and tested without one. Treat §3's
rehearsals as load-bearing rather than ceremonial, and inspect the first
category's output before trusting the rest.

---

## Adding content by hand instead

Sometimes the right answer is an authored facet, not an extracted one. Two
constraints govern this, both in the header of
`packages/database/src/seeds/data/jesus.data.ts`:

1. **A second facet only attaches to an episode that already has a harmony
   key.** The projection derives a standalone event's slug from its lead entry,
   so giving a standalone entry a harmony key to hang a facet off it moves the
   event's URL and orphans the old row.
2. **Append to a cluster, never prepend.** File order is `sort_order`, and a
   cluster is named after its first *action* entry — so adding an action entry
   ahead of the current lead renames the event, but only on a database seeded
   from scratch, because the `jesus_events` upsert is `doNothing` on title.
   Production and a fresh environment would then disagree.

Both are why nine of the compassion episodes could not take an authored facet
and had to be left to extraction.
