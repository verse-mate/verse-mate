import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

/**
 * Migration 2 of 9 (change: port-coach-pipeline, design D13).
 *
 * The leader roster moves out of the compiled-in `coach.data.json` and into
 * `coach_leaders`, which already exists as the identity join source for
 * admin-added leaders. Merging rather than adding a table keeps one roster:
 * two would immediately disagree about who is a leader.
 *
 * `slug` is load-bearing. `coach_reports.coach_id`, `coach_notes.coach_id` and
 * `coach_recording_links.coach_id` all key on the dataset slug
 * (e.g. "bryan-bailey"), so a roster without it cannot be joined to a single
 * report. It is UNIQUE for the same reason the reports key is: two leaders
 * sharing a slug would each see the other's sessions.
 *
 * `is_benchmark` marks the one leader the coaching model is benchmarked
 * against. Governance rule 1 — his name must not appear in another leader's
 * report — is unimplementable without a marker, and the roster carried none:
 * its fields were id / name / email / group / coachName / isCoach / zoomLink.
 * A partial unique index enforces "at most one", because the rule is written in
 * the singular and a second benchmark leader would make it ambiguous rather
 * than merely wrong.
 */
export async function up(db: Kysely<Database>): Promise<void> {
  console.log("Merging the leader roster into coach_leaders ...");

  await db.schema
    .alterTable("coach_leaders")
    // Nullable for now: rows added before this migration have no slug, and
    // 3.10's backfill is what fills them. Made NOT NULL once the bundle is gone.
    .addColumn("slug", "text")
    .addColumn("is_coach", "boolean", (col) => col.notNull().defaultTo(true))
    .addColumn("zoom_link", "text", (col) => col.notNull().defaultTo(""))
    .addColumn("is_benchmark", "boolean", (col) =>
      col.notNull().defaultTo(false),
    )
    // Intake attribution, migrated from the host's config/leader_map.json.
    // The recording bot files EVERY leader's meeting under one shared host
    // address, so the sender cannot identify the leader — the session TITLE
    // does. These keywords are what task 4.2 matches on, and the file they came
    // from has no home once the host is retired. In the database and
    // admin-editable (design open question 6, decided): changing a keyword is
    // an UPDATE, not a deploy.
    .addColumn("title_match", sql`text[]`, (col) =>
      col.notNull().defaultTo(sql`ARRAY[]::text[]`),
    )
    // Alternate addresses the SAME leader may appear under. Delivery still goes
    // to `email`.
    .addColumn("alt_emails", sql`text[]`, (col) =>
      col.notNull().defaultTo(sql`ARRAY[]::text[]`),
    )
    // Coverage attestation (task 4.7). A leader who is genuinely not teaching
    // looks exactly like a leader the recording bot fails to cover: both are
    // silent. No provider API can tell them apart — Fireflies exposes nothing
    // that lists configured or upcoming joins — so the distinction is recorded
    // by a human, explicitly, and never inferred.
    .addColumn("not_teaching_attested_at", "timestamp")
    .addColumn("not_teaching_attested_by", "uuid", (col) =>
      col.references("user.id").onDelete("set null"),
    )
    .execute();

  await db.schema
    .createIndex("coach_leaders_slug_uidx")
    .unique()
    .on("coach_leaders")
    .column("slug")
    .execute();

  await sql`
    CREATE UNIQUE INDEX coach_leaders_single_benchmark_uidx
    ON coach_leaders ((true)) WHERE is_benchmark
  `.execute(db);

  console.log("coach_leaders extended successfully");
}

export async function down(db: Kysely<Database>): Promise<void> {
  console.log("Reverting the leader roster merge ...");
  await sql`DROP INDEX IF EXISTS coach_leaders_single_benchmark_uidx`.execute(
    db,
  );
  await sql`DROP INDEX IF EXISTS coach_leaders_slug_uidx`.execute(db);
  await db.schema
    .alterTable("coach_leaders")
    .dropColumn("not_teaching_attested_by")
    .dropColumn("not_teaching_attested_at")
    .dropColumn("alt_emails")
    .dropColumn("title_match")
    .dropColumn("is_benchmark")
    .dropColumn("zoom_link")
    .dropColumn("is_coach")
    .dropColumn("slug")
    .execute();
  console.log("coach_leaders reverted successfully");
}
