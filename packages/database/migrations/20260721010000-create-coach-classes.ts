import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

/**
 * Bible-Coach portal: per-leader class schedule.
 *
 * The single `coach_zoom_links` row (one meeting link per leader) is kept for
 * the dashboard's quick-link card, but leaders who run several studies need to
 * register each one separately. `coach_classes` holds one row per class — its
 * name, meeting day/date, recurrence, and the Zoom / Meet / Teams link the
 * coaching Notetaker bot (Fireflies) joins. Many rows per user.
 *
 * The zoom_link on each class is the source of truth for which meetings the
 * bot auto-joins; the program admin reads every leader's classes via
 * GET /coach/admin/classes to configure those joins.
 */
export async function up(db: Kysely<Database>): Promise<void> {
  console.log("Creating coach_classes table...");

  await db.schema
    .createTable("coach_classes")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("user_id", "uuid", (col) =>
      col.references("user.id").onDelete("cascade").notNull(),
    )
    // Human name for the class, e.g. "Thursday Evening — James".
    .addColumn("name", "text", (col) => col.notNull())
    // Next / first meeting date, ISO yyyy-mm-dd. Nullable: a leader may set a
    // recurring day without pinning a first date.
    .addColumn("class_date", "date")
    // Recurrence keyword: none | daily | weekly | biweekly | monthly.
    .addColumn("recurrence", "text", (col) => col.defaultTo("weekly").notNull())
    // Zoom / Meet / Teams URL the bot joins. Empty until the leader pastes one.
    .addColumn("zoom_link", "text", (col) => col.defaultTo("").notNull())
    .addColumn("created_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull(),
    )
    .addColumn("updated_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull(),
    )
    .execute();

  // One leader's classes, most-recently-updated first.
  await db.schema
    .createIndex("coach_classes_user_id_idx")
    .on("coach_classes")
    .column("user_id")
    .execute();

  console.log("coach_classes table created successfully");
}

export async function down(db: Kysely<Database>): Promise<void> {
  console.log("Dropping coach_classes table...");

  await db.schema.dropTable("coach_classes").ifExists().execute();

  console.log("coach_classes table dropped successfully");
}
