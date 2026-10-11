import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";
import { refuseToDrop } from "./20261011010000-coach-reports-and-roster";

const BOT_STATES = [
  "observed",
  "held",
  "retrieval_failed",
  "retained",
  "scored",
  "delivered",
  "scoring_failed",
  "delivery_pending",
  "delivering",
  "delivery_failed",
];

const BOT_MATCHED_BY = [
  "title_match",
  "name",
  "alt_email",
  "unresolved",
  "admin",
];

const HOLD_KINDS = [
  "review",
  "reattributed",
  "governance",
  "cold-recall",
  "no-mailer",
  "send-failed",
  "scoring-version",
];

const listed = (values: string[]) => sql.join(values.map((v) => sql.lit(v)));

const TABLES = [
  "coach_report_edits",
  "coach_report_amendments",
  "coach_calibration_runs",
  "coach_session_assets",
  "coach_intake_sessions",
];

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("coach_intake_sessions")
    .addColumn("source_session_id", "text", (col) => col.primaryKey())
    .addColumn("coach_id", "text")
    .addColumn("matched_by", "text", (col) =>
      col.check(
        sql`matched_by IS NULL OR matched_by IN (${listed(BOT_MATCHED_BY)})`,
      ),
    )
    .addColumn("title", "text", (col) => col.notNull().defaultTo(""))
    .addColumn("host_email", "text")
    .addColumn("session_date", "date", (col) => col.notNull())
    .addColumn("session_started_at", "timestamptz")
    .addColumn("duration_minutes", "numeric")
    .addColumn("observed_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull(),
    )
    .addColumn("state", "text", (col) =>
      col
        .notNull()
        .defaultTo("observed")
        .check(sql`state IN (${listed(BOT_STATES)})`),
    )
    .addColumn("retry_count", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("hold_reason", "text")
    .addColumn("hold_kind", "text", (col) =>
      col.check(sql`hold_kind IS NULL OR hold_kind IN (${listed(HOLD_KINDS)})`),
    )
    .addColumn("release_required", "boolean", (col) =>
      col.notNull().defaultTo(false),
    )
    .addColumn("parallel_run", "boolean", (col) =>
      col.notNull().defaultTo(false),
    )
    .addColumn("send_unconfirmed", "boolean", (col) =>
      col.notNull().defaultTo(false),
    )
    .addColumn("published", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("delivered_to", sql`text[]`, (col) =>
      col.notNull().defaultTo(sql`ARRAY[]::text[]`),
    )
    .addColumn("skipped_recipients", sql`text[]`, (col) =>
      col.notNull().defaultTo(sql`ARRAY[]::text[]`),
    )
    .addColumn("attempted_to", sql`text[]`, (col) =>
      col.notNull().defaultTo(sql`ARRAY[]::text[]`),
    )
    .addColumn("reshare_requested_at", "timestamp")
    .addColumn("reshare_sent_at", "timestamp")
    .addColumn("reshare_resolved_at", "timestamp")
    .addColumn("report_id", "text", (col) =>
      col.references("coach_reports.id").onDelete("set null"),
    )
    .addColumn("updated_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull(),
    )
    .execute();
  await db.schema
    .createIndex("coach_intake_sessions_observed_idx")
    .on("coach_intake_sessions")
    .column("observed_at")
    .execute();
  await db.schema
    .createIndex("coach_intake_sessions_coach_date_idx")
    .on("coach_intake_sessions")
    .columns(["coach_id", "session_date"])
    .execute();
  await sql`
    CREATE INDEX coach_intake_sessions_pending_reshare_idx
    ON coach_intake_sessions (reshare_requested_at)
    WHERE reshare_requested_at IS NOT NULL AND reshare_resolved_at IS NULL
  `.execute(db);
  await sql`
    CREATE UNIQUE INDEX coach_intake_sessions_one_delivery_per_leader_uidx
    ON coach_intake_sessions (coach_id)
    WHERE state = 'delivering'
  `.execute(db);

  await db.schema
    .createTable("coach_session_assets")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("coach_id", "text", (col) => col.notNull())
    .addColumn("source_session_id", "text", (col) => col.notNull())
    .addColumn("report_id", "text", (col) =>
      col.references("coach_reports.id").onDelete("cascade"),
    )
    .addColumn("kind", "text", (col) =>
      col.notNull().check(sql`kind IN ('recording', 'transcript')`),
    )
    .addColumn("storage_key", "text", (col) => col.notNull())
    .addColumn("byte_size", "bigint")
    .addColumn("content_type", "text")
    .addColumn("created_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull(),
    )
    .execute();
  await db.schema
    .createIndex("coach_session_assets_session_kind_uidx")
    .unique()
    .on("coach_session_assets")
    .columns(["source_session_id", "kind"])
    .execute();
  await db.schema
    .createIndex("coach_session_assets_coach_kind_created_idx")
    .on("coach_session_assets")
    .columns(["coach_id", "kind", "created_at"])
    .execute();

  await db.schema
    .createTable("coach_calibration_runs")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("model_version", "text", (col) => col.notNull())
    .addColumn("composite_mae", "double precision", (col) => col.notNull())
    .addColumn("dimensions_within_one", "double precision", (col) =>
      col.notNull(),
    )
    .addColumn("comparisons", "integer", (col) => col.notNull())
    .addColumn("reports", "integer", (col) => col.notNull())
    .addColumn("per_leader", "jsonb")
    .addColumn("measured_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull(),
    )
    .execute();
  await db.schema
    .createIndex("coach_calibration_runs_version_idx")
    .on("coach_calibration_runs")
    .columns(["model_version", "id"])
    .execute();

  await db.schema
    .createTable("coach_report_amendments")
    .addColumn("report_id", "text", (col) =>
      col.notNull().references("coach_reports.id").onDelete("cascade"),
    )
    .addColumn("revision", "integer", (col) =>
      col.notNull().check(sql`revision >= 1`),
    )
    .addColumn("coach_id", "text", (col) => col.notNull())
    .addColumn("previous", "jsonb", (col) => col.notNull())
    .addColumn("changes", "jsonb", (col) => col.notNull())
    .addColumn("amended_by", "uuid", (col) =>
      col.references("user.id").onDelete("set null"),
    )
    .addColumn("amended_at", "timestamp", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("sent_to", sql`text[]`, (col) =>
      col.notNull().defaultTo(sql`ARRAY[]::text[]`),
    )
    .addColumn("skipped_recipients", sql`text[]`, (col) =>
      col.notNull().defaultTo(sql`ARRAY[]::text[]`),
    )
    .addColumn("attempted_to", sql`text[]`, (col) =>
      col.notNull().defaultTo(sql`ARRAY[]::text[]`),
    )
    .addColumn("sending_at", "timestamp")
    .addColumn("sent_at", "timestamp")
    .addPrimaryKeyConstraint("coach_report_amendments_pkey", [
      "report_id",
      "revision",
    ])
    .execute();

  await db.schema
    .createTable("coach_report_edits")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("report_id", "text", (col) =>
      col.notNull().references("coach_reports.id").onDelete("cascade"),
    )
    .addColumn("changes", "jsonb", (col) => col.notNull())
    .addColumn("edited_by", "uuid", (col) =>
      col.references("user.id").onDelete("set null"),
    )
    .addColumn("edited_at", "timestamp", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();
  await db.schema
    .createIndex("coach_report_edits_report_idx")
    .on("coach_report_edits")
    .column("report_id")
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  for (const table of TABLES) await refuseToDrop(db, table);
  for (const table of TABLES) await db.schema.dropTable(table).execute();
}
