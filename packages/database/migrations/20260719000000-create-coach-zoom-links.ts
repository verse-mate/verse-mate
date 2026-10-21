import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

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
