import type { Kysely } from "kysely";
import type Database from "../src/models/Database";

export async function up(db: Kysely<Database>): Promise<void> {
  console.log("Adding admin_override column to user_theme_preferences...");

  // Add admin_override column
  await db.schema
    .alterTable("user_theme_preferences")
    .addColumn("admin_override", "boolean", (col) =>
      col.defaultTo(false).notNull(),
    )
    .execute();

  console.log(
    "Successfully added admin_override column to user_theme_preferences.",
  );
}

export async function down(db: Kysely<Database>): Promise<void> {
  console.log("Removing admin_override column from user_theme_preferences...");

  await db.schema
    .alterTable("user_theme_preferences")
    .dropColumn("admin_override")
    .execute();

  console.log(
    "Successfully removed admin_override column from user_theme_preferences.",
  );
}
