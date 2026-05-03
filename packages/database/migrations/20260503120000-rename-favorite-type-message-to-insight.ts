import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

/**
 * Rename FavoriteTypeEnum value `'message'` → `'insight'`.
 *
 * Per spec feat-domain-model br-domain-011 (Phase 1 decision D-019).
 *
 * Mobile UI labels Favorites with `type='message'` as "insight bookmarks";
 * the DB enum value was misnomered. This migration aligns DB to UI language.
 *
 * Postgres allows renaming enum values without rewriting rows: existing rows
 * automatically read as the new label.
 */
export async function up(db: Kysely<Database>): Promise<void> {
  console.log(
    "Renaming favorite_type_enum value 'message' → 'insight' (D-019)...",
  );

  await sql`
    ALTER TYPE favorite_type_enum RENAME VALUE 'message' TO 'insight'
  `.execute(db);

  console.log("Renamed favorite_type_enum value successfully.");
}

export async function down(db: Kysely<Database>): Promise<void> {
  console.log("Reverting: renaming 'insight' → 'message'...");

  await sql`
    ALTER TYPE favorite_type_enum RENAME VALUE 'insight' TO 'message'
  `.execute(db);

  console.log("Reverted favorite_type_enum value rename.");
}
