import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

/**
 * Verse-of-the-Day curation store (GH-265).
 *
 * Four tables back the daily widget feature:
 *
 *   daily_verse_tags     — controlled vocabulary for theme/tone tags
 *                          (encouraging, hope, wisdom, …). A lookup table
 *                          rather than free-form strings so the curation pool
 *                          can't fragment on typos (encouraging vs
 *                          encouragment) and tag-filtered queries stay sound.
 *
 *   daily_verses         — the curated pool. One row per verse or short
 *                          (1–3 verse) passage. `book_id` is a FK into
 *                          `books.book_id` — the SAME surrogate id space the
 *                          reader uses (so the widget deep link carries an id
 *                          the chapter route already understands), NOT the
 *                          canonical numbering the bundled studies package
 *                          uses. `verse_end` is null for single verses; a
 *                          CHECK keeps the range non-inverted (the
 *                          same-chapter rule is enforced in the service layer
 *                          where the books/chapters lookup lives).
 *
 *   daily_verse_to_tag   — many-to-many between curated verses and tags.
 *
 *   daily_verse_history  — which verse was served on which date. `user_id` is
 *                          reserved for v2 per-user personalization; v1 always
 *                          writes NULL. The unique index is declared
 *                          NULLS NOT DISTINCT (Postgres 15+) so a single
 *                          global pick per date is actually enforced when
 *                          user_id is NULL — without it Postgres treats every
 *                          NULL as distinct and the one-pick-per-day guarantee
 *                          (and the ON CONFLICT upsert the selector relies on)
 *                          would silently break.
 */
export async function up(db: Kysely<Database>): Promise<void> {
  console.log("Creating daily_verse_tags table...");

  await db.schema
    .createTable("daily_verse_tags")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("slug", "varchar(50)", (col) => col.notNull().unique())
    .addColumn("label", "varchar(100)", (col) => col.notNull())
    .addColumn("is_active", "boolean", (col) => col.notNull().defaultTo(true))
    .addColumn("created_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  console.log("Creating daily_verses table...");

  await db.schema
    .createTable("daily_verses")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("book_id", "integer", (col) =>
      col.references("books.book_id").notNull(),
    )
    .addColumn("chapter_number", "integer", (col) => col.notNull())
    .addColumn("verse_start", "integer", (col) => col.notNull())
    .addColumn("verse_end", "integer")
    .addColumn("note", "text")
    .addColumn("is_active", "boolean", (col) => col.notNull().defaultTo(true))
    .addColumn("created_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    // verse_end, when present, must not be before verse_start. Cross-chapter
    // passages are rejected in the service layer (needs chapters lookup).
    .addCheckConstraint(
      "daily_verses_verse_range_check",
      sql`verse_end IS NULL OR verse_end >= verse_start`,
    )
    .execute();

  // Selection query filters on is_active; index it.
  await db.schema
    .createIndex("idx_daily_verses_is_active")
    .on("daily_verses")
    .column("is_active")
    .execute();

  console.log("Creating daily_verse_to_tag table...");

  await db.schema
    .createTable("daily_verse_to_tag")
    .addColumn("daily_verse_id", "uuid", (col) =>
      col.references("daily_verses.id").onDelete("cascade").notNull(),
    )
    .addColumn("tag_id", "uuid", (col) =>
      col.references("daily_verse_tags.id").onDelete("restrict").notNull(),
    )
    .addPrimaryKeyConstraint("daily_verse_to_tag_pkey", [
      "daily_verse_id",
      "tag_id",
    ])
    .execute();

  // Reverse lookup ("which verses carry this tag") for the admin filter.
  await db.schema
    .createIndex("idx_daily_verse_to_tag_tag")
    .on("daily_verse_to_tag")
    .column("tag_id")
    .execute();

  console.log("Creating daily_verse_history table...");

  await db.schema
    .createTable("daily_verse_history")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("pick_date", "date", (col) => col.notNull())
    .addColumn("daily_verse_id", "uuid", (col) =>
      col.references("daily_verses.id").onDelete("cascade").notNull(),
    )
    // Reserved for v2 per-user picks; v1 always NULL.
    .addColumn("user_id", "uuid", (col) =>
      col.references("user.id").onDelete("cascade"),
    )
    .addColumn("created_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  // One pick per (date, user). NULLS NOT DISTINCT makes the v1 global case
  // (user_id IS NULL) enforce a single row per date — required for the
  // selector's ON CONFLICT (pick_date, user_id) DO NOTHING upsert to work.
  await sql`
    CREATE UNIQUE INDEX idx_daily_verse_history_pick
    ON daily_verse_history (pick_date, user_id)
    NULLS NOT DISTINCT
  `.execute(db);
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("daily_verse_history").ifExists().execute();
  await db.schema.dropTable("daily_verse_to_tag").ifExists().execute();
  await db.schema.dropTable("daily_verses").ifExists().execute();
  await db.schema.dropTable("daily_verse_tags").ifExists().execute();
}
