# Rolling back the coach pipeline migrations

The coach pipeline migrations are the five `*-coach-*` files after
`20261011000000-user-confirmation-stamp` in `packages/database/migrations`. That first file
(the `user.email_verified_at` stamp) ships with the account confirmation change, not with
the coach, and is not part of this block. This page says what each down does to data, and
how to check that the block survives a full down and up.

The dates are placeholders: before the merge, each of the five files is renamed to the merge
day (keeping their order and the order after the newest migration on `main`), and the names
below change with them.

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

Take a dump of the coach tables before any rollback in an environment whose data matters.
A down that would drop data nothing rebuilds refuses while that data exists, naming the
table and what to do. To roll back anyway, dump the tables, then run the down with
`COACH_ROLLBACK_DISCARD_DATA=1` in its environment; any other value refuses. A column
holds data when it holds anything but the value a fresh up gives it (NULL, `false`, an
empty list, an empty string).

| Migration | Refuses while (the flag overrides) | Also |
|---|---|---|
| `20261011050000-coach-clear-unproven-confirmations` | never | Restores the confirmations the sweep and the roster triggers cleared, from `coach_confirmation_clears` (below). |
| `20261011040000-coach-identity-binding` | a leader or admin is bound to an account (`user_id` on `coach_leaders` or `coach_admins`); `coach_confirmation_clears`, `coach_leader_email_requests` or `coach_leader_email_changes` holds rows | Drops the clearing function and the triggers on `coach_leaders` and `coach_admins`. A pending address change can no longer be confirmed. Clear records the M6 down could not restore are lost with the flag. |
| `20261011030000-coach-uploads-rotating-schedules` | `coach_uploads`, `coach_rotating_classes`, `coach_reminder_sends`, `coach_reminder_summaries`, `coach_monthly_reports` or `coach_monday_reminders` holds rows; a leader is `rotating_only`; a session holds an upload or rotating-class column (`source = 'upload'`, `class_key`, `meeting_link`, `rotating_class_id`, `leader_cue`, `leader_cue_line`, `duplicate_of`, `duplicate_dismissed_at`) | Refuses with no override while a session is `received`, `upload_failed` or `duplicate`, or was matched by `rotating_class` or `upload`: the older schema cannot hold it. Dump those sessions and delete each one, or settle it on the current code. Uploaded recordings stay in the bucket, unreferenced. |
| `20261011020000-coach-session-pipeline` | `coach_intake_sessions`, `coach_session_assets`, `coach_calibration_runs`, `coach_report_amendments` or `coach_report_edits` holds rows | Stored recordings and transcripts stay in the bucket, unreferenced. |
| `20261011010000-coach-reports-and-roster` | `coach_reports`, `coach_monthly_narratives` or `coach_monthly_leader_summaries` holds rows; a roster column on `coach_leaders` holds data (`slug`, `is_coach`, `zoom_link`, `is_benchmark`, `title_match`, `alt_emails`, `not_teaching_attested_at`, `not_teaching_attested_by`) | Drops without a check `coach_report_dimension_scores` (their reports are guarded), `coach_dataset_meta` (derived from the reports) and `coach_admins` (configuration the roster backfill fills at every deploy, short enough to re-enter). |

## The confirmation sweep and its down

`20261011040000-coach-identity-binding` creates `coach_clear_unproven_confirmation` and the
triggers that call it when an address joins the roster or the admin list.
`20261011050000-coach-clear-unproven-confirmations` runs it once over every roster and admin
address. Each clear is recorded in `coach_confirmation_clears`: the account, its address as
it was, the provider links removed with it, and whether the sweep (`sweep`) or a trigger
(`joined`, which is how the deploy backfill clears the bundled leaders) made it.

```sql
SELECT source, email, jsonb_array_length(removed_links) AS links, cleared_at
FROM coach_confirmation_clears ORDER BY cleared_at;
```

The down of `20261011050000-coach-clear-unproven-confirmations` restores every record it
still can: where the account still exists, still has the recorded address (ignoring case
and surrounding spaces) and is still unconfirmed, it confirms the account again (with no
confirmation stamp, as before the clear) and puts back the removed provider links that are
not linked to an account again since. It deletes the records it restored and logs how many
accounts and links it restored, how many links it skipped, and how many records it left:
an account that changed address or confirmed again since is left as it is.
