# Rolling back the coach pipeline migrations

The coach pipeline migrations are the contiguous block from
`20260825120000-create-coach-reports-store` to the newest `*-coach-*` file in
`packages/database/migrations`. This page says what each down does to data, and how to
check that the block survives a full down and up.

## Check the round trip

```bash
cd packages/database
bun run migrate:coach-roundtrip
```

It reads the connection settings from `POSTGRES_URL` and refuses a server that is not
local. It creates a throwaway database `coach_roundtrip_<time>_<pid>`, runs every
migration up, takes down the whole coach block, runs it up again, and compares a schema
dump (columns, constraints, indexes, triggers, functions) taken after each up. It then
checks every down below that guards data: it brings the database to that migration,
seeds one row the down would lose or rewrite, and expects the down to refuse. A down
that drops data must then go through with `COACH_ROLLBACK_DISCARD_DATA=1`; a down that
rewrites rows must go through once the row is gone. Last it runs every migration up
again and compares the schema with the first up once more. It exits 1 naming the first
difference or each down that ran over its seeded row, and always drops the throwaway
database. It never connects to the database `POSTGRES_URL` names; it connects to
`postgres` on the same server only to create and drop the throwaway one.

## What each down does to data

Every down that would rewrite rows, or drop data nothing rebuilds, checks first and
refuses, naming the table and what to do. The two downs that drop rebuildable data
without a check are listed last. Take a dump of the coach tables before any rollback in
an environment whose data matters.

### Downs that refuse while rows they would rewrite exist

These used to change rows the rollback keeps. Now they refuse while such rows exist,
listing them, and no flag overrides that: settle the rows by hand on the current code,
then rerun the down.

| Migration | Refuses while | What to do |
|---|---|---|
| `20260901129000-coach-pipeline-states` | any session is `scoring_failed`, `delivery_pending`, `delivering` or `delivery_failed` (`SELECT state, count(*) FROM coach_intake_sessions GROUP BY state`) | Let each delivery finish on the current code. Settle each failed one by hand: record whether its recipients got the report, then move it to `delivered` or delete it. Turning these back into `scored` would make them claimable again on the older code, which could mail recipients twice. |
| `20260901135000-coach-intake-admin-attribution` | any session has `matched_by = 'admin'` | Record those assignments, then set `matched_by` on each to the value the older code should see. |
| `20260901146000-coach-reminder-claims` | any reminder claim has no confirmed send (`sent_at IS NULL`) | Check with the mail provider whether each went out. Set `sent_at` on the ones that did and delete the ones that did not. Deleting them blindly would let the older code send them again. |

### Downs that refuse to drop data unless told to

Each down below refuses while its table holds rows, or while its columns hold anything
but the value a fresh up gives them (NULL, `false`, an empty list, an empty string),
because nothing rebuilds that data. To roll back anyway, dump the tables, then run the
down with `COACH_ROLLBACK_DISCARD_DATA=1` in its environment; any other value refuses.

#### Tables

All rows of the table are lost.

| Migration | Table |
|---|---|
| `20260825120000-create-coach-reports-store` | `coach_reports` (`coach_dataset_meta` is dropped with it without a check: it is derived from the reports) |
| `20260901121000-coach-monthly-narratives` | `coach_monthly_narratives` |
| `20260901122000-coach-monthly-leader-summaries` | `coach_monthly_leader_summaries` |
| `20260901124000-coach-score-provenance` | `coach_report_dimension_scores` (human corrections included) |
| `20260901125000-coach-session-archive` | `coach_session_assets` (the stored objects stay in the bucket, unreferenced) |
| `20260901126000-coach-intake-sessions` | `coach_intake_sessions` |
| `20260901130000-coach-calibration-runs` | `coach_calibration_runs` |
| `20260901138000-coach-report-amendments` | `coach_report_amendments` |
| `20260901142000-coach-leader-email-changes` | `coach_leader_email_changes` |
| `20260901143000-coach-reminder-sends` | `coach_reminder_sends` |
| `20260901144000-coach-reminder-summaries` | `coach_reminder_summaries` |
| `20260901145000-coach-report-edits` | `coach_report_edits` |

#### Columns

The column's values are lost; the rows stay.

| Migration | Table: columns |
|---|---|
| `20260901120000-coach-roster-in-database` | `coach_leaders`: `slug`, `is_coach`, `zoom_link`, `is_benchmark`, `title_match`, `alt_emails`, `not_teaching_attested_at`, `not_teaching_attested_by` |
| `20260901127000-coach-report-evidence` | `coach_reports`: `evidence` |
| `20260901131000-coach-intake-hold-reason` | `coach_intake_sessions`: `hold_reason` |
| `20260901132000-coach-report-held` | `coach_reports`: `held` |
| `20260901133000-coach-calibration-per-leader` | `coach_calibration_runs`: `per_leader` |
| `20260901134000-coach-delivery-recipients` | `coach_intake_sessions`: `delivered_to` |
| `20260901136000-coach-delivery-skipped` | `coach_intake_sessions`: `skipped_recipients` |
| `20260901137000-coach-first-lesson` | `coach_reports`: `first_lesson`, `first_lesson_source`, `passage_book` |
| `20260901139000-coach-revision-claim` | `coach_report_amendments`: `sending_at` |
| `20260901140000-coach-amendment-leader` | `coach_report_amendments`: `coach_id` |
| `20260901141000-coach-intake-release-required` | `coach_intake_sessions`: `release_required` |
| `20260901147000-coach-delivery-published` | `coach_intake_sessions`: `published` |
| `20260901148000-coach-delivery-attempted` | `coach_intake_sessions`: `attempted_to` |
| `20260901149000-coach-revision-attempted` | `coach_report_amendments`: `attempted_to` |
| `20260901150000-coach-intake-parallel-run` | `coach_intake_sessions`: `parallel_run` (a parallel-run session becomes deliverable on older code) |
| `20260901151000-coach-intake-session-start` | `coach_intake_sessions`: `session_started_at` |
| `20260901152000-coach-intake-hold-kind` | `coach_intake_sessions`: `hold_kind` |
| `20260901153000-coach-intake-send-unconfirmed` | `coach_intake_sessions`: `send_unconfirmed` |

### Downs that drop data without a check

- `20260901123000-coach-admin-role` drops `coach_admins`. Its rows are configuration
  that its own up seeds and the roster backfill fills, and the list is short enough to
  re-enter.
- `20260901146000-coach-reminder-claims` drops `coach_reminder_sends.claimed_at` once no
  unconfirmed claim is left. Its up sets it from `sent_at` again.

### Downs that touch no data

`20260901128000-coach-one-report-per-session` drops an index only.
