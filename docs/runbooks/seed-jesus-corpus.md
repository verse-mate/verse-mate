# Runbook — seed the Jesus corpus

Populates the content behind the Jesus tab. Until this runs against an
environment, every Jesus screen renders empty states: the hub reports zero
events, browse and study lists come back empty, and the reader bridge shows
nothing on any chapter.

This is a **manual step with no home in the deploy pipeline**. The backend
container entrypoint runs `migrate-deploy` and then starts the server; it never
runs `db:seed`. Any fresh environment therefore needs this doing by hand.

## 1. Confirm the repair migration is applied

The seeder writes to `jesus_collection_events`. That table is created by
`20260817150000-repair-jesus-event-graph` on databases where the original
migration skipped it (see the note at the bottom for why). Seeding before it
lands fails on a missing table.

```sql
SELECT name FROM kysely_migration
WHERE name = '20260817150000-repair-jesus-event-graph';
```

One row → proceed. No rows → wait for the deploy.

## 2. Run from a repo checkout, not the container

The production image contains only `./dist` and `./migrations`. The seeder needs
the source tree and the Bible JSON data under
`packages/backend-base/src/bible/data/`, so this runs from a machine with the
repo cloned and `bun install` done.

Two access notes:

- The managed database restricts by trusted sources; whichever machine runs
  this has to be on the allowlist.
- **Keep `?sslmode=require` in the connection string.** `getSSLConfig()` detects
  that exact substring to enable TLS with `rejectUnauthorized: false` — the
  managed database uses self-signed certificates — and
  `getCleanConnectionString()` then strips it before connecting, because
  `sslmode` in the URL conflicts with the `ssl` object. Omit it and TLS is off
  and the connection is refused.

## 3. Run

```bash
git checkout main && git pull
bun install
cd packages/database
POSTGRES_URL='postgresql://USER:PASS@HOST:PORT/DB?sslmode=require' bun db:seed
```

Expect several minutes. Most of it is the Bible seed walking 66 books and
skipping what already exists — that is normal, not a hang.

## 4. Verify

The last line of output should read:

```
Jesus event graph: 207 events, 231 facets, 367 passages
```

In the database:

```sql
SELECT (SELECT COUNT(*) FROM jesus_entries)           AS entries,      -- 231
       (SELECT COUNT(*) FROM jesus_events)            AS events,       -- 207
       (SELECT COUNT(*) FROM jesus_facets)            AS facets,       -- 231
       (SELECT COUNT(*) FROM jesus_event_passages)    AS passages,     -- 367
       (SELECT COUNT(*) FROM jesus_event_themes)      AS themes,       -- 374
       (SELECT COUNT(*) FROM jesus_collection_events) AS coll_events;  -- 87
```

Then spot-check the API:

- `GET /jesus/events/overview` reports 207 total events
- `GET /jesus/for-passage?book_id=41&chapter=4&verse=39` returns
  "Calming the storm"

If the counts differ, investigate before assuming it is fine — a partial seed is
more likely than a changed corpus.

## Safety

**Safe to re-run.** If it fails partway, run it again. The Bible seed is
existence-guarded per book and chapter, translation templates use
`ON CONFLICT`, the Jesus seed upserts, and the event-graph projection is
idempotent — a second run adds nothing and leaves all six counts unchanged.

**Deletes are scoped.** `jesus.seed.ts` replaces `jesus_entry_references`,
`jesus_entry_themes` and `jesus_collection_entries` wholesale so that edits to
the seed data converge, but only for the `entry_id` / `collection_id` values it
owns. Nothing outside the seeded corpus is touched, and none of it cascades into
the event-graph tables.

**`seed:themes` is not part of this.** CI runs it alongside `db:seed`, but it
seeds topic themes and has nothing to do with the Jesus corpus.

## Why the repair migration exists

`20260817130000-migrate-jesus-entries-to-events` projects `jesus_entries` onto
the event graph and creates `jesus_collection_events` on the way — both *after*
an early return that fires when the corpus is empty. Because production migrates
without ever seeding, that migration took the early return, recorded itself as
applied, and left the table uncreated with no way to run again.
`20260817150000` is the repair: it creates the table if absent and re-projects,
and it is a separate file precisely because editing an already-applied migration
would only change what fresh databases do.

## Follow-up worth doing

Give this a home in the release process — a one-shot job or a documented release
step. Avoid putting it in the container entrypoint, where it would run on every
boot and every restart.
