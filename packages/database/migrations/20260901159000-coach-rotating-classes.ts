import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";
import { refuseToDrop } from "./20260825120000-create-coach-reports-store";

const MATCHED_BY = ["title_match", "name", "alt_email", "unresolved", "admin"];

async function allowMatchedBy(db: Kysely<Database>, values: string[]) {
  await sql`ALTER TABLE coach_intake_sessions DROP CONSTRAINT IF EXISTS coach_intake_sessions_matched_by_check`.execute(
    db,
  );
  await sql`ALTER TABLE coach_intake_sessions ADD CONSTRAINT coach_intake_sessions_matched_by_check CHECK (matched_by IS NULL OR matched_by IN (${sql.join(values.map((v) => sql.lit(v)))}))`.execute(
    db,
  );
}

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
    .alterTable("coach_intake_sessions")
    .addColumn("rotating_class_id", "integer", (col) =>
      col.references("coach_rotating_classes.id").onDelete("set null"),
    )
    .execute();
  await allowMatchedBy(db, [...MATCHED_BY, "rotating_class"]);
}

export async function down(db: Kysely<Database>): Promise<void> {
  await refuseToDrop(db, "coach_rotating_classes");
  await refuseToDrop(db, "coach_leaders", "rotating_only");
  await refuseToDrop(
    db,
    "coach_intake_sessions",
    "matched_by = 'rotating_class'",
  );
  await allowMatchedBy(db, MATCHED_BY);
  await db.schema
    .alterTable("coach_intake_sessions")
    .dropColumn("rotating_class_id")
    .execute();
  await db.schema
    .alterTable("coach_leaders")
    .dropColumn("rotating_only")
    .execute();
  await db.schema
    .dropTable("coach_rotating_class_leaders")
    .ifExists()
    .execute();
  await db.schema.dropTable("coach_rotating_classes").ifExists().execute();
}
