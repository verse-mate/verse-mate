import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";
import { refuseToDrop } from "./20260825120000-create-coach-reports-store";

const STATES = [
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
const MATCHED_BY = [
  "title_match",
  "name",
  "alt_email",
  "unresolved",
  "admin",
  "rotating_class",
];

async function allow(
  db: Kysely<Database>,
  constraint: string,
  column: string,
  values: string[],
  nullable: boolean,
) {
  await sql`ALTER TABLE coach_intake_sessions DROP CONSTRAINT IF EXISTS ${sql.raw(constraint)}`.execute(
    db,
  );
  await sql`ALTER TABLE coach_intake_sessions ADD CONSTRAINT ${sql.raw(constraint)} CHECK (${sql.raw(nullable ? `${column} IS NULL OR ` : "")}${sql.ref(column)} IN (${sql.join(values.map((v) => sql.lit(v)))}))`.execute(
    db,
  );
}

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("coach_uploads")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("coach_id", "text", (col) => col.notNull())
    .addColumn("class_key", "text", (col) => col.notNull())
    .addColumn("class_name", "text", (col) => col.notNull())
    .addColumn("session_date", "date", (col) => col.notNull())
    .addColumn("title", "text", (col) =>
      col.check(sql`title IS NULL OR char_length(title) <= 80`),
    )
    .addColumn("file_name", "text", (col) => col.notNull())
    .addColumn("file_bytes", "bigint", (col) => col.notNull())
    .addColumn("content_type", "text", (col) => col.notNull())
    .addColumn("parts", "integer", (col) => col.notNull())
    .addColumn("uploaded_by", "uuid", (col) =>
      col.references("user.id").onDelete("set null"),
    )
    .addColumn("by_admin", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("state", "text", (col) =>
      col
        .notNull()
        .defaultTo("awaiting-file")
        .check(
          sql`state IN ('awaiting-file', 'received', 'failed', 'discarded')`,
        ),
    )
    .addColumn("failure", "text")
    .addColumn("source_session_id", "text", (col) => col.unique())
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn("received_at", "timestamptz")
    .execute();
  await sql`
    CREATE UNIQUE INDEX coach_uploads_one_per_class_date_uidx
    ON coach_uploads (class_key, session_date)
    WHERE state IN ('awaiting-file', 'received')
  `.execute(db);
  await db.schema
    .alterTable("coach_intake_sessions")
    .addColumn("source", "text", (col) =>
      col.notNull().defaultTo("bot").check(sql`source IN ('bot', 'upload')`),
    )
    .addColumn("class_key", "text")
    .addColumn("meeting_link", "text")
    .addColumn("duplicate_of", "text")
    .addColumn("duplicate_dismissed_at", "timestamptz")
    .execute();
  await allow(
    db,
    "coach_intake_sessions_state_check",
    "state",
    [...STATES, "received", "upload_failed", "duplicate"],
    false,
  );
  await allow(
    db,
    "coach_intake_sessions_matched_by_check",
    "matched_by",
    [...MATCHED_BY, "upload"],
    true,
  );
}

export async function down(db: Kysely<Database>): Promise<void> {
  await refuseToDrop(db, "coach_uploads");
  await refuseToDrop(
    db,
    "coach_intake_sessions",
    "source = 'upload' OR state IN ('received', 'upload_failed', 'duplicate') OR matched_by = 'upload' OR class_key IS NOT NULL OR meeting_link IS NOT NULL OR duplicate_of IS NOT NULL",
  );
  await allow(
    db,
    "coach_intake_sessions_matched_by_check",
    "matched_by",
    MATCHED_BY,
    true,
  );
  await allow(db, "coach_intake_sessions_state_check", "state", STATES, false);
  await db.schema
    .alterTable("coach_intake_sessions")
    .dropColumn("duplicate_dismissed_at")
    .dropColumn("duplicate_of")
    .dropColumn("meeting_link")
    .dropColumn("class_key")
    .dropColumn("source")
    .execute();
  await db.schema.dropTable("coach_uploads").ifExists().execute();
}
