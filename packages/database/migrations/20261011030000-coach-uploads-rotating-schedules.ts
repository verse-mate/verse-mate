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

const listed = (values: string[]) => sql.join(values.map((v) => sql.lit(v)));

async function allowSessions(
  db: Kysely<Database>,
  states: string[],
  matchedBy: string[],
): Promise<void> {
  await sql`ALTER TABLE coach_intake_sessions DROP CONSTRAINT coach_intake_sessions_state_check`.execute(
    db,
  );
  await sql`ALTER TABLE coach_intake_sessions ADD CONSTRAINT coach_intake_sessions_state_check CHECK (state IN (${listed(states)}))`.execute(
    db,
  );
  await sql`ALTER TABLE coach_intake_sessions DROP CONSTRAINT coach_intake_sessions_matched_by_check`.execute(
    db,
  );
  await sql`ALTER TABLE coach_intake_sessions ADD CONSTRAINT coach_intake_sessions_matched_by_check CHECK (matched_by IS NULL OR matched_by IN (${listed(matchedBy)}))`.execute(
    db,
  );
}

const TABLES = [
  "coach_monday_reminders",
  "coach_monthly_reports",
  "coach_reminder_summaries",
  "coach_reminder_sends",
  "coach_uploads",
  "coach_rotating_classes",
];

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("coach_rotating_classes")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("group_email", "text", (col) =>
      col.notNull().unique().check(sql`group_email = lower(group_email)`),
    )
    .addColumn("title_match", sql`text[]`, (col) =>
      col.notNull().defaultTo(sql`'{}'`),
    )
    .addColumn("created_at", "timestamp", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();
  await db.schema
    .createTable("coach_rotating_class_leaders")
    .addColumn("class_id", "integer", (col) =>
      col.notNull().references("coach_rotating_classes.id").onDelete("cascade"),
    )
    .addColumn("leader_slug", "text", (col) => col.notNull())
    .addPrimaryKeyConstraint("coach_rotating_class_leaders_pkey", [
      "class_id",
      "leader_slug",
    ])
    .execute();
  await db.schema
    .alterTable("coach_leaders")
    .addColumn("rotating_only", "boolean", (col) =>
      col.notNull().defaultTo(false),
    )
    .execute();

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
    .addColumn("attempts", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("claimed_at", "timestamptz")
    .addColumn("addresses_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
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
    .addColumn("rotating_class_id", "integer", (col) =>
      col.references("coach_rotating_classes.id").onDelete("set null"),
    )
    .addColumn("leader_cue", "text", (col) =>
      col.check(
        sql`leader_cue IN ('opening_prayer', 'reading', 'application', 'closing_prayer', 'none')`,
      ),
    )
    .addColumn("leader_cue_line", "text")
    .addColumn("duplicate_of", "text")
    .addColumn("duplicate_dismissed_at", "timestamptz")
    .execute();
  await allowSessions(
    db,
    [...BOT_STATES, "received", "upload_failed", "duplicate"],
    [...BOT_MATCHED_BY, "rotating_class", "upload"],
  );

  await db.schema
    .createTable("coach_reminder_sends")
    .addColumn("coach_id", "text", (col) => col.notNull())
    .addColumn("reminder_date", "date", (col) => col.notNull())
    .addColumn("report_id", "text", (col) => col.notNull())
    .addColumn("email", "text", (col) => col.notNull())
    .addColumn("claimed_at", "timestamp", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("sent_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addPrimaryKeyConstraint("coach_reminder_sends_pkey", [
      "coach_id",
      "reminder_date",
    ])
    .execute();
  await db.schema
    .createTable("coach_reminder_summaries")
    .addColumn("reminder_date", "date", (col) => col.primaryKey())
    .addColumn("sent_at", "timestamp", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  await db.schema
    .createTable("coach_monthly_reports")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("kind", "text", (col) =>
      col.notNull().check(sql`kind IN ('leader', 'program')`),
    )
    .addColumn("coach_id", "text")
    .addColumn("month", "text", (col) =>
      col.notNull().check(sql`month ~ '^[0-9]{4}-[0-9]{2}$'`),
    )
    .addColumn("summary", "jsonb", (col) => col.notNull())
    .addColumn("state", "text", (col) =>
      col
        .notNull()
        .check(
          sql`state IN ('held', 'pending', 'sending', 'sent', 'parallel-run')`,
        ),
    )
    .addColumn("hold_reason", "text")
    .addColumn("sent_to", sql`text[]`, (col) =>
      col.notNull().defaultTo(sql`'{}'`),
    )
    .addColumn("skipped", sql`text[]`, (col) =>
      col.notNull().defaultTo(sql`'{}'`),
    )
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn("released_at", "timestamptz")
    .addColumn("sending_at", "timestamptz")
    .addColumn("sent_at", "timestamptz")
    .addCheckConstraint(
      "coach_monthly_reports_coach_check",
      sql`(kind = 'leader') = (coach_id IS NOT NULL)`,
    )
    .execute();
  await sql`
    CREATE UNIQUE INDEX coach_monthly_reports_one_uidx
    ON coach_monthly_reports (kind, coalesce(coach_id, ''), month)
  `.execute(db);

  await db.schema
    .createTable("coach_monday_reminders")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("run_date", "date", (col) => col.notNull())
    .addColumn("kind", "text", (col) =>
      col.notNull().check(sql`kind IN ('leader', 'class')`),
    )
    .addColumn("coach_id", "text")
    .addColumn("rotating_class_id", "integer")
    .addColumn("found", "boolean", (col) => col.notNull())
    .addColumn("outcome", "text", (col) =>
      col
        .notNull()
        .check(
          sql`outcome IN ('sent', 'skipped', 'failed', 'not-needed', 'checked-by-class')`,
        ),
    )
    .addColumn("email", "text")
    .addColumn("reason", "text")
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();
  await sql`
    CREATE UNIQUE INDEX coach_monday_reminders_one_uidx
    ON coach_monday_reminders (run_date, kind, coalesce(coach_id, ''), coalesce(rotating_class_id, 0))
  `.execute(db);
}

export async function down(db: Kysely<Database>): Promise<void> {
  const { rows } = await sql<{
    row: string;
  }>`SELECT source_session_id || ' (' || state || ', ' || coalesce(matched_by, 'unmatched') || ')' AS row FROM coach_intake_sessions WHERE state IN ('received', 'upload_failed', 'duplicate') OR matched_by IN ('rotating_class', 'upload') ORDER BY 1`.execute(
    db,
  );
  if (rows.length > 0)
    throw new Error(
      `coach_intake_sessions has ${rows.length} upload or rotating-class session(s) the older code cannot hold: ${rows.map((r) => r.row).join(", ")}. Dump them, delete each one (or settle it on the current code), then rerun the down.`,
    );
  for (const table of TABLES) await refuseToDrop(db, table);
  await refuseToDrop(db, "coach_leaders", "rotating_only");
  await refuseToDrop(
    db,
    "coach_intake_sessions",
    "source = 'upload' OR class_key IS NOT NULL OR meeting_link IS NOT NULL OR rotating_class_id IS NOT NULL OR leader_cue IS NOT NULL OR leader_cue_line IS NOT NULL OR duplicate_of IS NOT NULL OR duplicate_dismissed_at IS NOT NULL",
  );
  await allowSessions(db, BOT_STATES, BOT_MATCHED_BY);
  await db.schema
    .alterTable("coach_intake_sessions")
    .dropColumn("duplicate_dismissed_at")
    .dropColumn("duplicate_of")
    .dropColumn("leader_cue_line")
    .dropColumn("leader_cue")
    .dropColumn("rotating_class_id")
    .dropColumn("meeting_link")
    .dropColumn("class_key")
    .dropColumn("source")
    .execute();
  await db.schema
    .alterTable("coach_leaders")
    .dropColumn("rotating_only")
    .execute();
  await db.schema.dropTable("coach_rotating_class_leaders").execute();
  for (const table of TABLES) await db.schema.dropTable(table).execute();
}
