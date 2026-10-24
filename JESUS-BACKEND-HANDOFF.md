# Jesus feature — backend handoff

What is left for the team on the Jesus line-by-line ("By-Line") coverage work and
the related-events cap. Written 2026-10-24.

Two requests drove this work:

1. every Bible verse the Jesus feature prints should carry a line-by-line explanation;
2. the RELATED EVENTS list should show three items, not six.

The code for both is written. The client half is merged. What remains is one PR to
land and one content job that needs production access.

---

## 1. Land the backend PR

**[verse-mate/verse-mate#333](https://github.com/verse-mate/verse-mate/pull/333)** —
branch `claude/jesus-verses-explanations-fu4div`, head `e23d22b`, base `main` at
`7be9c3c`. Open, ready for review, no reviews yet. 9 files, +718 / −5.

| file | what it is |
| --- | --- |
| `src/jesus/utils/byline-coverage.ts` | the coverage assessment, no database access, unit-testable |
| `src/jesus/scripts/jesus-byline-coverage.ts` | the `jesus:byline` report script |
| `src/jesus/__tests__/byline-coverage.test.ts` | 14 cases over the assessment |
| `src/jesus/jesus.constants.ts` | `JESUS_RELATED_LIMIT = 3` |
| `src/jesus/services/jesus-event.service.ts` | event graph related — uses the limit |
| `src/jesus/services/jesus.service.ts` | uses the limit (was a hardcoded 6) |
| `src/jesus/repository/jesus.repository.ts` | legacy entry related — limit as the default arg |
| `packages/backend-base/package.json` | the `jesus:byline` script entry |
| `docs/runbooks/fill-jesus-byline.md` | the fill runbook (section 2 below summarises it) |

### Why CI is red, and why it is not this PR

CI on this PR fails, and it is a repo-wide runner problem rather than anything in
the diff. Please confirm this yourself before treating the red as a review finding:

- Jobs complete in **~3 seconds** with `runner_id: 0`, `runner_name: ""`, and the
  logs endpoint 404s — no runner was ever assigned, so nothing ran.
- **`main` is red identically** at `7be9c3c` (run 539, 4s), as is PR #332 and
  `feature/github-actions-migration`.
- Everything through 2026-10-21 (run 536) passed, in minutes.
- Onset was ~14:45 UTC 2026-10-23, which lines up with the in-flight GitHub
  Actions / registry migration on `feature/github-actions-migration` — that branch's
  own runs are failing the same way.
- As of 19:26 UTC 2026-10-24 no runner had picked up a job anywhere in the repo for
  ~28 hours. Run 540 attempt 2 (my one re-run) is still the newest run in the repo.

**Action:** once runners are healthy, re-run the checks on `e23d22b` and review
normally. No code change is needed to make them pass as far as I can tell.

### What was validated locally instead

On the merge commit `e23d22b`, in a container without Docker:

- `bun run lint` — clean (8 warnings, all pre-existing in files this PR does not touch)
- `bun tsc` — clean
- `bun stylelint` — clean
- Jesus suite — **155 passed**, including the 14 new coverage tests
- 2 failures in `jesus.repository.test.ts` with `ECONNREFUSED 127.0.0.1:5432` — they
  are `main`'s own live-Postgres integration tests, byte-identical to `main`'s copy
  (they arrived in `0a91207`, PR #338) and unrelated to this diff. CI provides Postgres.
- Cloudflare independently built and deployed `e23d22b` successfully.

### One thing to look at in review

`e23d22b` is a merge of `main` into the branch, resolving two conflicts, both by
union:

- `packages/backend-base/package.json` — kept this branch's `jesus:byline` script
  alongside `main`'s new `coach:*` scripts.
- `jesus.repository.ts` — kept `main`'s `containsPattern` import alongside this
  branch's `JESUS_RELATED_LIMIT`. Both are live: `containsPattern` in the search
  filter (`:389`), `JESUS_RELATED_LIMIT` as the `getRelatedEntryIds` default (`:594`).

---

## 2. Fill the missing explanations (needs production access)

**This is the part the PR cannot do, and the part that actually closes the original
request.** The script reports gaps; it does not write content.

The Jesus screens generate no By-Line content of their own. Commentary is stored per
Bible chapter keyed by (book, chapter, verse); an event knows the verses it spans, so
the client narrows the chapter's byline to the pericope. That is only ever as complete
as the chapters behind it, and it comes up short two ways:

| status | meaning | fill |
| --- | --- | --- |
| `ungenerated` | the chapter has no active byline at all | generate that chapter |
| `partial` | the chapter has a byline that skipped some of *this event's* verses | **re**generate that chapter |

They look identical on screen. Only `partial` is invisible to a "has this chapter been
generated?" check, which is why they are counted separately.

### Step 1 — run the report against production

```sh
cd packages/backend-base
bun run jesus:byline              # whole corpus
bun run jesus:byline -- --gaps    # only passages with gaps
bun run jesus:byline -- --json    # machine-readable, for CI or to drive the fill
bun run jesus:byline -- --strict  # exit 1 when anything is missing
```

Needs the usual `packages/backend-base/.env` (it opens a database connection and
constructs `BibleRepository`). It reads and never writes. The report ends with the
chapters to generate, grouped by book — that list is the input to step 2.

> ⚠️ **This script has never been run against a live database.** The container it was
> written in has no Postgres. Its assessment logic is covered by the 14 unit tests on
> fixtures and the queries typecheck against the Kysely models, but the first real run
> is unverified. Please eyeball the first output for sanity (plausible event counts,
> sane verse spans) before acting on it at scale.

Which byline counts as "live" is decided by `BibleRepository.getExplanation`, so the
report sees what a reader would — `is_active`, version ordering and language fallback
included. Completeness is read with `findVersesMissingSummary` from
`shared/byline-chunking.ts`, the same guard the generator holds itself to, so
"explained" here means exactly what it means at generation time. Both sides of the
feature are covered: `jesus_event_passages` on active events and
`jesus_entry_references` on active entries.

### Step 2 — submit the fill

Chapter bylines are generated by the **admin batch operation**, not by this script —
one submission at half price with a 24h window, which is what a few hundred chapters
wants. In the admin batch UI, submit a **book batch** per book the report named:

- **type**: `byline` only
- **chapters**: the numbers the report printed for that book
- **skip existing**: **off** for the `partial` chapters — the whole point is to replace
  a byline that skipped verses. Leave it on if you are only filling `ungenerated` ones.

Regenerating is what fills a partial chapter; there is no per-verse top-up, since the
byline is one document per chapter.

### Step 3 — confirm

```sh
bun run jesus:byline -- --strict
```

Zero verses missing is the finish line. A chapter that comes back `partial` twice is a
generation problem, not a coverage one — `findVersesMissingSummary` names the verses,
and `shared/byline-chunking.ts` is where a chapter long enough to lose its tail gets
split.

Full version of this in `docs/runbooks/fill-jesus-byline.md` on the PR branch.

---

## 3. Already done — no action needed

**[verse-mate/verse-mate-web#297](https://github.com/verse-mate/verse-mate-web/pull/297)
— merged.** This was the third gap, and it was in the client rather than the content:
the By-Line tab fetched only the primary account's chapter, so on an event several
Gospels tell — Matthew 4:17 and Mark 1:14-15 for "Repent, for the kingdom of heaven is
at hand" — the other accounts showed nothing however well generated their chapters
were. The tab now fetches every passage's chapter and renders one section per account.
The 3-item related cap is in the client too, so the list is capped even against a
backend that still returns six.

So if a passage shows an empty By-Line panel today, it is a content gap (section 2),
not the client bug.

---

## Open questions for the team

1. **Who runs the fill?** It needs admin access and a live OpenAI batch submission. I
   could not do either from the session container.
2. **Should `jesus:byline -- --strict` run in CI?** It would catch a regression in
   coverage, but it needs a database with the real corpus, so it probably belongs in a
   scheduled job rather than per-PR.
3. **Was 6 → 3 the intended number everywhere?** `JESUS_RELATED_LIMIT` now governs both
   the event graph and the legacy entries. If the two surfaces are meant to differ, that
   is a one-line split.
