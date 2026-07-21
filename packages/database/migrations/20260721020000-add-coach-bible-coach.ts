import type { Kysely } from "kysely";
import type Database from "../src/models/Database";

/**
 * Bible-Coach portal: per-leader Bible coach selection.
 *
 * The leader's meeting link + affiliated church already live in
 * coach_zoom_links (one row per user). Which coach mentors them is the third
 * user-writable setup field, so it rides on the same row. Empty string means
 * "unset" — the portal defaults the picker to Bryan Bailey in that case.
 */
export async function up(db: Kysely<Database>): Promise<void> {
  console.log("Adding bible_coach to coach_zoom_links...");

  await db.schema
    .alterTable("coach_zoom_links")
    .addColumn("bible_coach", "text", (col) => col.defaultTo("").notNull())
    .execute();

  console.log("bible_coach column added successfully");
}

export async function down(db: Kysely<Database>): Promise<void> {
  console.log("Dropping bible_coach from coach_zoom_links...");

  await db.schema
    .alterTable("coach_zoom_links")
    .dropColumn("bible_coach")
    .execute();

  console.log("bible_coach column dropped successfully");
}
