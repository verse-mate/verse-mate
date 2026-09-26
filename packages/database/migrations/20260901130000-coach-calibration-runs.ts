import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

export async function up(db: Kysely<Database>): Promise<void> {
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
    .addColumn("measured_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull(),
    )
    .execute();
  await db.schema
    .createIndex("coach_calibration_runs_version_idx")
    .on("coach_calibration_runs")
    .columns(["model_version", "id"])
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("coach_calibration_runs").ifExists().execute();
}
