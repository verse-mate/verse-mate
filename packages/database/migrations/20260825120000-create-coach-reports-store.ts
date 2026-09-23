import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

/**
 * Bible-Coach portal: reports move out of the compiled-in `coach.data.json`
 * bundle into a runtime store (change: coach-reports-store).
 *
 * `coach_reports` holds one row per evaluated session. Its `id` is the report's
 * immutable identity: for reports backfilled from the deployed dataset it IS the
 * existing dataset slug (so `coach_notes`/`coach_recording_links`, which key on
 * that slug, keep joining with no rewrite, and already-issued `?s=<id>` email
 * links keep resolving); reports published later get an opaque endpoint-assigned
 * id. Upserts match on the title-free natural key `(coach_id, session_date,
 * source_session_id)`, which is UNIQUE so re-ingesting one session updates it in
 * place while a second session on the same date becomes its own report. `legacy_ids` records ids a report was
 * previously known by (populated only when a re-title changes a derived id).
 *
 * `coach_dataset_meta` is a single-row provenance signal, a monotonic `version`
 * (a trigger enforces it only ever advances) and the `report_count` it
 * represents, so a stale or partial publish is detectable rather than able to
 * overwrite live data (the date-only `generated_at` could not provide this).
 */
export async function up(db: Kysely<Database>): Promise<void> {
  console.log("Creating coach_reports + coach_dataset_meta ...");

  await db.schema
    .createTable("coach_reports")
    // The immutable report id: the deployed slug for backfilled rows, an opaque
    // value for reports first published after the backfill. Never re-derived.
    .addColumn("id", "text", (col) => col.primaryKey())
    // The coach slug (e.g. "bryan-bailey"), the same key the overlay tables use.
    .addColumn("coach_id", "text", (col) => col.notNull())
    .addColumn("session_date", "date", (col) => col.notNull())
    // The provider's identifier for the recorded session this report evaluates.
    // NOT NULL is load-bearing: Postgres treats NULLs as distinct in a unique
    // index, so a nullable column would switch the guard OFF for exactly the
    // backfilled rows and a second backfill run would double the corpus.
    // Backfilled rows, which have no source session, take the title-free
    // sentinel `legacy:<coach_id>:<session_date>`; deriving it from the legacy
    // report id would embed the session title, which report identity forbids
    // and which breaks idempotence across a re-title.
    .addColumn("source_session_id", "text", (col) => col.notNull())
    // Ids this report was previously issued under (re-title history). Queried
    // with `= ANY(legacy_ids)` when resolving an older link.
    .addColumn("legacy_ids", sql`text[]`, (col) =>
      col.notNull().defaultTo(sql`ARRAY[]::text[]`),
    )
    // List-row view: date, dateLabel, session, topic, duration, attendees,
    // newcomers, score, status, statusEmoji, pdfUrl, docUrl.
    .addColumn("summary", "jsonb", (col) => col.notNull())
    // Cheap aggregation for trends/monthly: clusters, dimensions, base, bonuses.
    .addColumn("metrics", "jsonb", (col) => col.notNull())
    // Full detail loaded per session: prose, sections, feedback, big ideas.
    .addColumn("body", "jsonb", (col) => col.notNull())
    .addColumn("created_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull(),
    )
    .addColumn("updated_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull(),
    )
    .execute();

  // Title-free natural key. The source session is part of it: a leader who
  // teaches twice on one date gets TWO reports with distinct immutable ids,
  // while re-ingesting the same source session updates in place. Keyed on
  // (coach_id, session_date) alone, the second session of a day was a hard
  // unique-violation and the intake dedupe silently dropped it.
  await db.schema
    .createIndex("coach_reports_coach_date_session_uidx")
    .unique()
    .on("coach_reports")
    .columns(["coach_id", "session_date", "source_session_id"])
    .execute();

  // Read paths: list by coach, and resolve a legacy id.
  await db.schema
    .createIndex("coach_reports_coach_idx")
    .on("coach_reports")
    .column("coach_id")
    .execute();
  await sql`CREATE INDEX coach_reports_legacy_ids_gin ON coach_reports USING GIN (legacy_ids)`.execute(
    db,
  );

  await db.schema
    .createTable("coach_dataset_meta")
    // Single-row guard: only one meta row can ever exist.
    .addColumn("id", "boolean", (col) =>
      col.primaryKey().defaultTo(true).check(sql`id = true`),
    )
    .addColumn("version", "bigint", (col) => col.notNull().defaultTo(0))
    .addColumn("report_count", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("generated_at", "text")
    .addColumn("schema_version", "integer")
    .addColumn("updated_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull(),
    )
    .execute();

  // The provenance signal must only ever advance, enforced in the schema, not
  // just app code, so a regressing publish cannot rewrite it.
  await sql`
    CREATE FUNCTION coach_dataset_meta_version_monotonic()
    RETURNS trigger AS $$
    BEGIN
      IF NEW.version < OLD.version THEN
        RAISE EXCEPTION 'coach_dataset_meta.version cannot decrease (% -> %)', OLD.version, NEW.version;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `.execute(db);
  await sql`
    CREATE TRIGGER coach_dataset_meta_version_guard
    BEFORE UPDATE ON coach_dataset_meta
    FOR EACH ROW EXECUTE FUNCTION coach_dataset_meta_version_monotonic();
  `.execute(db);

  console.log("coach_reports + coach_dataset_meta created successfully");
}

export async function down(db: Kysely<Database>): Promise<void> {
  console.log("Dropping coach_reports + coach_dataset_meta ...");
  await sql`DROP TRIGGER IF EXISTS coach_dataset_meta_version_guard ON coach_dataset_meta`.execute(
    db,
  );
  await sql`DROP FUNCTION IF EXISTS coach_dataset_meta_version_monotonic()`.execute(
    db,
  );
  await db.schema.dropTable("coach_dataset_meta").ifExists().execute();
  await db.schema.dropTable("coach_reports").ifExists().execute();
  console.log("coach_reports + coach_dataset_meta dropped successfully");
}
