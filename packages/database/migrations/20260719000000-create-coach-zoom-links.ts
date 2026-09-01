import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

/**
 * Bible-Coach portal: per-leader meeting link.
 *
 * The coach portal's reports + trends are served from the coaching-pipeline
 * dataset — a compiled-in bundle at the time, the coach_* tables since
 * (change: port-coach-pipeline); the leader's Zoom / Meet
 * link is the one mutable field, stored here keyed by user. One row per user.
 */
export async function up(db: Kysely<Database>): Promise<void> {
  console.log("Creating coach_zoom_links table...");

  await db.schema
    .createTable("coach_zoom_links")
    .addColumn("user_id", "uuid", (col) =>
      col.primaryKey().references("user.id").onDelete("cascade").notNull(),
    )
    .addColumn("zoom_link", "text", (col) => col.defaultTo("").notNull())
    .addColumn("updated_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`).notNull(),
    )
    .execute();

  console.log("coach_zoom_links table created successfully");
}

export async function down(db: Kysely<Database>): Promise<void> {
  console.log("Dropping coach_zoom_links table...");

  await db.schema.dropTable("coach_zoom_links").execute();

  console.log("coach_zoom_links table dropped successfully");
}
