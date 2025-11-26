import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

export async function up(db: Kysely<Database>): Promise<void> {
  console.log(
    "Adding default auto-highlights enabled setting to auto_highlight_settings...",
  );

  // Insert default setting for auto-highlights enabled (disabled by default for new users)
  await db
    .insertInto("auto_highlight_settings")
    .values({
      setting_key: "default_auto_highlights_enabled",
      setting_value: "false",
    })
    .execute();

  console.log(
    "Successfully added default_auto_highlights_enabled setting (default: false).",
  );
}

export async function down(db: Kysely<Database>): Promise<void> {
  console.log(
    "Removing default auto-highlights enabled setting from auto_highlight_settings...",
  );

  await db
    .deleteFrom("auto_highlight_settings")
    .where("setting_key", "=", "default_auto_highlights_enabled")
    .execute();

  console.log("Successfully removed default_auto_highlights_enabled setting.");
}
