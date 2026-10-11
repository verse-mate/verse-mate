import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

export const DISCARD_FLAG = "COACH_ROLLBACK_DISCARD_DATA";

export async function refuseToDrop(
  db: Kysely<Database>,
  table: string,
  holding = "true",
): Promise<void> {
  const { rows } = await sql<{
    n: number;
  }>`SELECT count(*)::int AS n FROM ${sql.table(table)} WHERE ${sql.raw(holding)}`.execute(
    db,
  );
  const n = rows[0]?.n ?? 0;
  if (n === 0 || process.env[DISCARD_FLAG] === "1") return;
  const which = holding === "true" ? "" : ` where ${holding}`;
  throw new Error(
    `${table} has ${n} row(s)${which}, and this down drops that data for good. Dump ${table} first, then rerun the down with ${DISCARD_FLAG}=1 to discard it.`,
  );
}

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("coach_reports")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("coach_id", "text", (col) => col.notNull())
    .addColumn("session_date", "date", (col) => col.notNull())
    .addColumn("source_session_id", "text", (col) => col.notNull())
    .addColumn("legacy_ids", sql`text[]`, (col) =>
      col.notNull().defaultTo(sql`ARRAY[]::text[]`),
    )
    .addColumn("summary", "jsonb", (col) => col.notNull())
    .addColumn("metrics", "jsonb", (col) => col.notNull())
    .addColumn("body", "jsonb", (col) => col.notNull())
    .addColumn("evidence", "jsonb")
    .addColumn("held", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("first_lesson", "boolean", (col) =>
      col.notNull().defaultTo(false),
    )
    .addColumn("first_lesson_source", "text", (col) =>
      col.check(sql`first_lesson_source IN ('detected', 'admin')`),
    )
    .addColumn("first_lesson_line", "text")
    .addColumn("created_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull(),
    )
    .addColumn("updated_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull(),
    )
    .execute();
  await db.schema
    .createIndex("coach_reports_coach_date_session_uidx")
    .unique()
    .on("coach_reports")
    .columns(["coach_id", "session_date", "source_session_id"])
    .execute();
  await db.schema
    .createIndex("coach_reports_coach_idx")
    .on("coach_reports")
    .column("coach_id")
    .execute();
  await sql`CREATE INDEX coach_reports_legacy_ids_gin ON coach_reports USING GIN (legacy_ids)`.execute(
    db,
  );
  await sql`
    CREATE INDEX coach_reports_evidence_idx
    ON coach_reports (coach_id)
    WHERE evidence IS NOT NULL
  `.execute(db);
  await sql`
    CREATE UNIQUE INDEX coach_reports_source_session_uidx
    ON coach_reports (source_session_id)
  `.execute(db);

  await db.schema
    .createTable("coach_dataset_meta")
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

  await db.schema
    .createTable("coach_report_dimension_scores")
    .addColumn("report_id", "text", (col) =>
      col.notNull().references("coach_reports.id").onDelete("cascade"),
    )
    .addColumn("dimension_n", "integer", (col) =>
      col.notNull().check(sql`dimension_n BETWEEN 1 AND 12`),
    )
    .addColumn("score", "integer", (col) =>
      col.check(sql`score IS NULL OR score BETWEEN 1 AND 5`),
    )
    .addColumn("machine_score", "integer", (col) =>
      col.check(sql`machine_score IS NULL OR machine_score BETWEEN 1 AND 5`),
    )
    .addColumn("rationale", "text", (col) => col.notNull().defaultTo(""))
    .addColumn("provenance", "text", (col) =>
      col.notNull().check(sql`provenance IN ('machine', 'human')`),
    )
    .addColumn("model_version", "text")
    .addColumn("language_model", "text")
    .addColumn("prompt_version", "text")
    .addColumn("generation_settings", "jsonb")
    .addColumn("corrected_by", "uuid", (col) =>
      col.references("user.id").onDelete("set null"),
    )
    .addColumn("updated_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull(),
    )
    .addPrimaryKeyConstraint("coach_report_dimension_scores_pkey", [
      "report_id",
      "dimension_n",
    ])
    .execute();

  await db.schema
    .alterTable("coach_leaders")
    .addColumn("slug", "text")
    .addColumn("is_coach", "boolean", (col) => col.notNull().defaultTo(true))
    .addColumn("zoom_link", "text", (col) => col.notNull().defaultTo(""))
    .addColumn("is_benchmark", "boolean", (col) =>
      col.notNull().defaultTo(false),
    )
    .addColumn("title_match", sql`text[]`, (col) =>
      col.notNull().defaultTo(sql`ARRAY[]::text[]`),
    )
    .addColumn("alt_emails", sql`text[]`, (col) =>
      col.notNull().defaultTo(sql`ARRAY[]::text[]`),
    )
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

  await db.schema
    .createTable("coach_admins")
    .addColumn("email", "text", (col) => col.primaryKey())
    .addColumn("granted_by", "uuid", (col) =>
      col.references("user.id").onDelete("set null"),
    )
    .addColumn("granted_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull(),
    )
    .execute();
  await sql`
    CREATE FUNCTION coach_admins_normalize_email()
    RETURNS trigger AS $$
    BEGIN
      NEW.email = lower(btrim(NEW.email));
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `.execute(db);
  await sql`
    CREATE TRIGGER coach_admins_normalize_email_trg
    BEFORE INSERT OR UPDATE ON coach_admins
    FOR EACH ROW EXECUTE FUNCTION coach_admins_normalize_email();
  `.execute(db);

  await db.schema
    .createTable("coach_monthly_narratives")
    .addColumn("month", "text", (col) => col.primaryKey())
    .addColumn("executive_summary", "jsonb", (col) =>
      col.notNull().defaultTo(sql`'[]'::jsonb`),
    )
    .addColumn("trends", "jsonb", (col) =>
      col.notNull().defaultTo(sql`'[]'::jsonb`),
    )
    .addColumn("updated_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull(),
    )
    .execute();

  await db.schema
    .createTable("coach_monthly_leader_summaries")
    .addColumn("coach_id", "text", (col) => col.notNull())
    .addColumn("month", "text", (col) => col.notNull())
    .addColumn("summary", "jsonb", (col) => col.notNull())
    .addColumn("updated_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull(),
    )
    .addPrimaryKeyConstraint("coach_monthly_leader_summaries_pkey", [
      "coach_id",
      "month",
    ])
    .execute();
  await db.schema
    .createIndex("coach_monthly_leader_summaries_month_idx")
    .on("coach_monthly_leader_summaries")
    .column("month")
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await refuseToDrop(db, "coach_reports");
  await refuseToDrop(db, "coach_monthly_narratives");
  await refuseToDrop(db, "coach_monthly_leader_summaries");
  await refuseToDrop(
    db,
    "coach_leaders",
    "slug IS NOT NULL OR NOT is_coach OR zoom_link <> '' OR is_benchmark OR title_match <> '{}' OR alt_emails <> '{}' OR not_teaching_attested_at IS NOT NULL OR not_teaching_attested_by IS NOT NULL",
  );
  await db.schema.dropTable("coach_monthly_leader_summaries").execute();
  await db.schema.dropTable("coach_monthly_narratives").execute();
  await db.schema.dropTable("coach_admins").execute();
  await sql`DROP FUNCTION coach_admins_normalize_email()`.execute(db);
  await sql`DROP INDEX coach_leaders_single_benchmark_uidx`.execute(db);
  await sql`DROP INDEX coach_leaders_slug_uidx`.execute(db);
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
  await db.schema.dropTable("coach_report_dimension_scores").execute();
  await db.schema.dropTable("coach_dataset_meta").execute();
  await sql`DROP FUNCTION coach_dataset_meta_version_monotonic()`.execute(db);
  await db.schema.dropTable("coach_reports").execute();
}
