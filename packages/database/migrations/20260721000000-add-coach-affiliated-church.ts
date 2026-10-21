import type { Kysely } from "kysely";
import type Database from "../src/models/Database";

export async function up(db: Kysely<Database>): Promise<void> {
  console.log("Adding affiliated_church to coach_zoom_links...");

  await db.schema
    .alterTable("coach_zoom_links")
    .addColumn("affiliated_church", "text", (col) =>
      col.defaultTo("").notNull(),
    )
    .execute();

  console.log("affiliated_church column added successfully");
}

export async function down(db: Kysely<Database>): Promise<void> {
  console.log("Dropping affiliated_church from coach_zoom_links...");

  await db.schema
    .alterTable("coach_zoom_links")
    .dropColumn("affiliated_church")
    .execute();

  console.log("affiliated_church column dropped successfully");
}
