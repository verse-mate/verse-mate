# Rolling back the coach pipeline migrations

The coach pipeline migrations are the five `*-coach-*` files after
`20261011000000-user-confirmation-stamp` in `packages/database/migrations`. That first file
(the `user.email_verified_at` stamp) ships with the account confirmation change, not with
the coach, and is not part of this block. Its down refuses while any account carries a
confirmation stamp, unless run with `ROLLBACK_DISCARD_CONFIRMATION_STAMPS=1`: dropping the
stamps would make every confirmation made since the deploy look unproven, and the sweep run
again would clear all of them. Its up and down set a 5 s lock timeout that lasts for the rest
of the migration run, so a deploy that applies it together with the coach migrations stops
before the API starts if any of them waits longer than that for a lock on a live table; rerun
the deploy once the blocking session is gone. This page says what each down does to data, and how to check
that the block survives a full down and up (the round trip stops above that first file, so it
never runs its down).

The five files are dated `20261011150000` to `20261011190000`, after the newest migration on
`main` when they were last renamed (`20261011140000-batch-jobs-keep-history-of-deleted-creators`)
and after `20261011000000-user-confirmation-stamp` (the identity binding's function reads
`user.email_verified_at`). If `main` gains a migration dated later before the merge, rename the
five again after it, keeping their order. The imports between them
(`20261011150000-coach-reports-and-roster` is imported by the later four and by the round
trip) and the two coach tests that import a migration move with the names. The round trip
finds each migration by the part of its name after the date. It refuses to run, and the test
`coach-migration-order.test.ts` fails in CI,
while any other migration sorts after the first coach file: production has run that migration,
so the migrator would refuse the block and the API would not start. After renaming, merge the
newest `main`, run `bun run migrate:coach-roundtrip`, and merge only when it exits 0 and CI is
green.

## A database that ran the branch's earlier migrations

Before 2026-10-11 the branch carried 49 coach migrations, since consolidated into these five.
A local or test database that ran them stops at start (`corrupted migrations: previously
executed migration ... is missing`). So does one that ran the five under their earlier dates
(`20261011010000` to `20261011050000`, then `20261011070000` to `20261011110000`) or under any
date before a later rename. Production never ran them. Recreate such a database (drop it,
create it, `bun run migrate:deploy`, `bun run db:seed`).

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
would leave rows the older schema cannot hold must go through once the row is gone. Last
it runs every migration up again and compares the schema with the first up once more. It
exits 1 naming the first difference or each down that ran over its seeded row, and always
drops the throwaway database. It never connects to the database `POSTGRES_URL` names; it
connects to `postgres` on the same server only to create and drop the throwaway one.

## What each down does to data

Take a dump of the coach tables before any rollback in an environment whose data matters, and
step down one migration at a time (`cd packages/database && bun run migrate:down`): several
downs in one run share a transaction, so a later refusal rolls back an earlier down that already
logged its work.
A down that would drop data nothing rebuilds refuses while that data exists, naming the
table and what to do. To roll back anyway, dump the tables, then run the down with
`COACH_ROLLBACK_DISCARD_DATA=1` in its environment; any other value refuses. A column
holds data when it holds anything but the value a fresh up gives it (NULL, `false`, an
empty list, an empty string).

| Migration | Refuses while (the flag overrides) | Also |
|---|---|---|
| `20261011190000-coach-clear-unproven-confirmations` | `coach_confirmation_clears` holds rows, with neither `COACH_ROLLBACK_RESTORE_CONFIRMATIONS=1` nor `COACH_ROLLBACK_DISCARD_DATA=1` | With `COACH_ROLLBACK_RESTORE_CONFIRMATIONS=1` it restores the confirmations the sweep and the roster triggers cleared (below). With `COACH_ROLLBACK_DISCARD_DATA=1` it leaves them cleared and keeps the records. |
| `20261011180000-coach-identity-binding` | a leader or admin is bound to an account (`user_id` on `coach_leaders` or `coach_admins`); `coach_confirmation_clears`, `coach_leader_email_requests` or `coach_leader_email_changes` holds rows | Drops the clearing function and the triggers on `coach_leaders` and `coach_admins`. A pending address change can no longer be confirmed. Clear records the sweep's down did not restore are lost with the flag. |
| `20261011170000-coach-uploads-rotating-schedules` | `coach_uploads`, `coach_rotating_classes`, `coach_reminder_sends`, `coach_reminder_summaries`, `coach_monthly_reports` or `coach_monday_reminders` holds rows; a leader is `rotating_only`; a session holds an upload or rotating-class column (`source = 'upload'`, `class_key`, `meeting_link`, `rotating_class_id`, `leader_cue`, `leader_cue_line`, `duplicate_of`, `duplicate_dismissed_at`) | Refuses with no override while a session is `received`, `upload_failed` or `duplicate`, or was matched by `rotating_class` or `upload`: the older schema cannot hold it. Dump those sessions and delete each one, or settle it on the current code. Uploaded recordings stay in the bucket, unreferenced. |
| `20261011160000-coach-session-pipeline` | `coach_intake_sessions`, `coach_session_assets`, `coach_calibration_runs`, `coach_report_amendments` or `coach_report_edits` holds rows | Stored recordings and transcripts stay in the bucket, unreferenced. |
| `20261011150000-coach-reports-and-roster` | `coach_reports`, `coach_monthly_narratives` or `coach_monthly_leader_summaries` holds rows; a roster column on `coach_leaders` holds data (`slug`, `is_coach`, `zoom_link`, `is_benchmark`, `title_match`, `alt_emails`, `not_teaching_attested_at`, `not_teaching_attested_by`) | Drops without a check `coach_report_dimension_scores` (their reports are guarded), `coach_dataset_meta` (derived from the reports) and `coach_admins` (the admin list; an admin bound to an account is guarded by the identity binding's down, and nothing puts the list back: export it before this down and restore it after the up, as below). |

### Keeping the admin list across a roster rollback

Nothing seeds `coach_admins` at deploy any more, so a down and up of
`20261011150000-coach-reports-and-roster` loses every admin unless they are put back. Before the
down, export the list; after the up, restore it:

```bash
psql "$POSTGRES_URL" -c "\copy (SELECT email, granted_by, granted_at FROM coach_admins) TO 'coach_admins.csv' CSV HEADER"
psql "$POSTGRES_URL" -c "\copy coach_admins (email, granted_by, granted_at) FROM 'coach_admins.csv' CSV HEADER"
```

Keep the file outside every repository and delete it once restored: it holds the admins'
addresses. Each admin claims the role again on their next sign-in with that address confirmed.
Without an export, re-add each admin as for a fresh environment (below).

## A fresh environment: its first admin and benchmark leader

A new database (local development, CI, a ticket database) migrates with an empty coach roster.
Nothing in the product makes the first program admin (granting needs an admin) or marks the
benchmark leader. An operator does both directly in that database:

```sql
INSERT INTO coach_admins (email) VALUES ('<admin address>');
UPDATE coach_leaders SET is_benchmark = true WHERE slug = '<leader slug>';
```

Check the address with its owner before the insert: whoever confirms it at sign-in becomes a
program admin. Read it back afterwards with `SELECT email, user_id FROM coach_admins;`.

The admin signs in with that address confirmed and claims the role. At most one leader is the
benchmark; with none marked, the benchmark-name check holds nothing back.

Production already has both. Nothing re-marks the benchmark leader at deploy, so if the marker
is ever lost there, the lead restores it with the same `UPDATE`, on the owner's word.

## Correcting or removing content in a legacy report

Reports loaded from the legacy corpus (`source_session_id` starting `legacy:`) have no writer
in the product: the pipeline that produced them is retired, and the portal does not edit them.
When a leader asks to correct or remove part of one (a disclosure, a quote), the owner decides.
On the owner's word, an operator edits that row's `summary`, `metrics` or `body` directly,
inside a transaction, after saving the row as it was:

```sql
BEGIN;
SELECT id, summary, metrics, body FROM coach_reports WHERE id = '<report id>';
UPDATE coach_reports SET body = '<edited body>'::jsonb, updated_at = now() WHERE id = '<report id>';
COMMIT;
```

The report keeps its id, so links already sent keep opening it.

## The confirmation sweep and its down

`20261011180000-coach-identity-binding` creates `coach_clear_unproven_confirmation` and the
triggers that call it when an address joins the roster or the admin list.
`20261011190000-coach-clear-unproven-confirmations` runs it once over every roster and admin
address. Each clear is recorded in `coach_confirmation_clears`: the account, its address as
it was, the provider links removed with it, and whether the sweep (`sweep`) or a trigger
(`joined`, when a roster or admin address is added later) made it.

```sql
SELECT source, email, jsonb_array_length(removed_links) AS links, cleared_at
FROM coach_confirmation_clears ORDER BY cleared_at;
```

The down of `20261011190000-coach-clear-unproven-confirmations` refuses while any clear is
recorded, unless told what to do with them:

- `COACH_ROLLBACK_DISCARD_DATA=1` leaves every cleared account cleared and keeps the records
  (the identity binding's down then refuses to drop them without the same flag).
- `COACH_ROLLBACK_RESTORE_CONFIRMATIONS=1` restores every record it still can: where the
  account still exists, still has the recorded address (ignoring case and surrounding spaces),
  is still unconfirmed and still has the password it had when cleared, it confirms the account
  again (with no confirmation stamp, as before the clear) and puts back the removed provider
  links that are not linked to an account again since. It deletes the records it restored and
  logs how many accounts and links it restored, how many links it skipped, and how many records
  it left: an account that changed address or password, or confirmed again, is left as it is.

A restored account is exactly as unproven as it was before the deploy: whoever renamed into a
roster or admin address holds it again, with the provider links made for their own address.
While this branch's code still runs, the real owner's next Google or Apple sign-in on that
address stamps the account and binds the leader record or admin role to it, links included.
So restore only when the identity change is being rolled back as a whole, and never while this
branch's API serves: stop the API, or move it to main's image first (the deploy runbook's
rollback), then run the sweep's down with the restore flag and the identity binding's down
after it. Otherwise leave the clears in place.

Nothing reads `coach_confirmation_clears` but this down. Once the rollback window has closed,
empty it (`DELETE FROM coach_confirmation_clears`): it holds the addresses and removed provider
identities of cleared accounts, and the sweep's down then has nothing to restore.
