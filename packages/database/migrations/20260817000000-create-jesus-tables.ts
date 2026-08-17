import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

/**
 * "Jesus" feature — a curated, richly-faceted index over the life, words and
 * actions of Jesus, sitting alongside (not inside) the existing Topics feature.
 *
 * Shape rationale:
 *
 *  - `jesus_entries` is deliberately ONE polymorphic table with a `kind`
 *    discriminator rather than nine sibling tables. Every surface in the
 *    feature — His Words, His Actions, Parables, Explore by Topic, Popular
 *    Studies, Follow His Life — is a filtered + sorted projection of the same
 *    list, so a single table keeps the read path to one query shape and lets
 *    web and mobile share one card renderer.
 *
 *  - Scripture lives in `jesus_entry_references` as normalized
 *    (book_id, chapter, verse_start, verse_end) rows instead of free-text
 *    strings. That is what makes verse-level deep links into the reader, the
 *    "which gospel" facet, and cross-gospel harmony grouping possible without
 *    re-parsing text on every request.
 *
 *  - `harmony_key` groups the same episode as told by different gospels into a
 *    single entry carrying several references (e.g. the stilling of the storm
 *    in Matthew, Mark and Luke). Without it a chronological walk through the
 *    life would show the same event three times.
 *
 *  - Translations and explanations mirror the existing `topic_translations` /
 *    `topic_explanations` contracts exactly, so the AI explanation pipeline and
 *    the language-fallback logic already in the codebase apply unchanged.
 */
export async function up(db: Kysely<Database>): Promise<void> {
  console.log("Creating Jesus feature tables...");

  // ── Periods — the chronological spine of "Follow His Life" ──────────────
  await db.schema
    .createTable("jesus_periods")
    .addColumn("period_id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("slug", "varchar(80)", (col) => col.notNull().unique())
    .addColumn("name", "varchar(160)", (col) => col.notNull())
    .addColumn("subtitle", "varchar(255)")
    .addColumn("description", "text")
    .addColumn("sort_order", "integer", (col) => col.notNull())
    .addColumn("is_active", "boolean", (col) => col.defaultTo(true))
    .addColumn("created_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  // ── Themes — the "Explore by Topic" row (Kingdom, Faith, Prayer, …) ─────
  await db.schema
    .createTable("jesus_themes")
    .addColumn("theme_id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("slug", "varchar(80)", (col) => col.notNull().unique())
    .addColumn("name", "varchar(120)", (col) => col.notNull())
    .addColumn("description", "text")
    .addColumn("sort_order", "integer", (col) => col.notNull())
    .addColumn("is_active", "boolean", (col) => col.defaultTo(true))
    .addColumn("created_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  // ── Entries — the atomic unit behind every card in the feature ──────────
  await db.schema
    .createTable("jesus_entries")
    .addColumn("entry_id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    // Globally unique (not per-kind) so /jesus/entry/<slug> stays a flat,
    // stable, shareable URL even if an entry is later re-categorised.
    .addColumn("slug", "varchar(120)", (col) => col.notNull().unique())
    .addColumn("kind", "varchar(24)", (col) => col.notNull())
    .addColumn("title", "varchar(255)", (col) => col.notNull())
    .addColumn("summary", "text")
    // The actual words of Jesus, when the entry is a saying. Null for entries
    // that are events rather than speech (most miracles / encounters).
    .addColumn("quote", "text")
    .addColumn("quote_reference", "varchar(120)")
    .addColumn("period_id", "uuid", (col) =>
      col.references("jesus_periods.period_id").onDelete("set null"),
    )
    .addColumn("chronology_order", "integer")
    .addColumn("harmony_key", "varchar(80)")
    .addColumn("sort_order", "integer")
    .addColumn("is_active", "boolean", (col) => col.defaultTo(true))
    .addColumn("created_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  // ── Scripture references ────────────────────────────────────────────────
  await db.schema
    .createTable("jesus_entry_references")
    .addColumn("reference_id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("entry_id", "uuid", (col) =>
      col.references("jesus_entries.entry_id").onDelete("cascade").notNull(),
    )
    .addColumn("book_id", "integer", (col) =>
      col.references("books.book_id").notNull(),
    )
    .addColumn("chapter", "integer", (col) => col.notNull())
    // Null verse bounds mean "the whole chapter" — matches how the reader
    // treats a bare "Matthew 24" reference.
    .addColumn("verse_start", "integer")
    .addColumn("verse_end", "integer")
    .addColumn("is_primary", "boolean", (col) => col.defaultTo(false))
    .addColumn("sort_order", "integer", (col) => col.defaultTo(0))
    .addColumn("created_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  // ── Entry ↔ theme ───────────────────────────────────────────────────────
  await db.schema
    .createTable("jesus_entry_themes")
    .addColumn("entry_id", "uuid", (col) =>
      col.references("jesus_entries.entry_id").onDelete("cascade").notNull(),
    )
    .addColumn("theme_id", "uuid", (col) =>
      col.references("jesus_themes.theme_id").onDelete("cascade").notNull(),
    )
    .addPrimaryKeyConstraint("jesus_entry_themes_pkey", [
      "entry_id",
      "theme_id",
    ])
    .execute();

  // ── Collections — the "Popular Studies" shelf ───────────────────────────
  await db.schema
    .createTable("jesus_collections")
    .addColumn("collection_id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("slug", "varchar(80)", (col) => col.notNull().unique())
    .addColumn("name", "varchar(160)", (col) => col.notNull())
    .addColumn("subtitle", "varchar(255)")
    .addColumn("description", "text")
    // Dynamic membership. When set, members are resolved by running this
    // filter against jesus_entries instead of reading
    // jesus_collection_entries — so "Every question Jesus asked" stays
    // complete as content is added, while hand-picked studies
    // ("The I AM statements") keep an explicit ordered member list.
    // Shape: { "kind": "QUESTION" } | { "themes": ["prayer"] } | { "books": [40] }
    .addColumn("filter", "jsonb")
    .addColumn("is_featured", "boolean", (col) => col.defaultTo(false))
    .addColumn("sort_order", "integer", (col) => col.defaultTo(0))
    .addColumn("is_active", "boolean", (col) => col.defaultTo(true))
    .addColumn("created_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  await db.schema
    .createTable("jesus_collection_entries")
    .addColumn("collection_id", "uuid", (col) =>
      col
        .references("jesus_collections.collection_id")
        .onDelete("cascade")
        .notNull(),
    )
    .addColumn("entry_id", "uuid", (col) =>
      col.references("jesus_entries.entry_id").onDelete("cascade").notNull(),
    )
    .addColumn("sort_order", "integer", (col) => col.defaultTo(0))
    .addPrimaryKeyConstraint("jesus_collection_entries_pkey", [
      "collection_id",
      "entry_id",
    ])
    .execute();

  // ── i18n: entry bodies ──────────────────────────────────────────────────
  await db.schema
    .createTable("jesus_entry_translations")
    .addColumn("translation_id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("entry_id", "uuid", (col) =>
      col.references("jesus_entries.entry_id").onDelete("cascade").notNull(),
    )
    .addColumn("language_code", "varchar(10)", (col) => col.notNull())
    .addColumn("translated_title", "varchar(255)", (col) => col.notNull())
    .addColumn("translated_summary", "text")
    .addColumn("translated_quote", "text")
    .addColumn("is_active", "boolean", (col) => col.defaultTo(true))
    .addColumn("created_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  // ── i18n: taxonomy labels (periods / themes / collections) ──────────────
  // One table rather than three: these rows carry a name and an optional blurb
  // and nothing else, so a discriminated table keeps the schema honest without
  // three near-identical sibling tables. Referential integrity is enforced in
  // the service layer since the target table varies by entity_type.
  await db.schema
    .createTable("jesus_label_translations")
    .addColumn("label_translation_id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("entity_type", "varchar(20)", (col) => col.notNull())
    .addColumn("entity_id", "uuid", (col) => col.notNull())
    .addColumn("language_code", "varchar(10)", (col) => col.notNull())
    .addColumn("translated_name", "varchar(255)", (col) => col.notNull())
    .addColumn("translated_description", "text")
    .addColumn("is_active", "boolean", (col) => col.defaultTo(true))
    .addColumn("created_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  // ── AI explanations — same contract as topic_explanations ───────────────
  await db.schema
    .createTable("jesus_entry_explanations")
    .addColumn("explanation_id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("entry_id", "uuid", (col) =>
      col.references("jesus_entries.entry_id").onDelete("cascade").notNull(),
    )
    .addColumn("type", "varchar(50)", (col) => col.notNull())
    .addColumn("explanation", "text", (col) => col.notNull())
    .addColumn("language_code", "varchar(10)", (col) => col.notNull())
    .addColumn("version", "integer", (col) => col.defaultTo(1))
    .addColumn("is_active", "boolean", (col) => col.defaultTo(true))
    .addColumn("created_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  // ── Indexes ─────────────────────────────────────────────────────────────
  await db.schema
    .createIndex("idx_jesus_entries_kind")
    .on("jesus_entries")
    .columns(["kind", "sort_order"])
    .execute();

  await db.schema
    .createIndex("idx_jesus_entries_period")
    .on("jesus_entries")
    .columns(["period_id", "chronology_order"])
    .execute();

  await db.schema
    .createIndex("idx_jesus_entries_harmony")
    .on("jesus_entries")
    .column("harmony_key")
    .execute();

  await db.schema
    .createIndex("idx_jesus_entry_references_entry")
    .on("jesus_entry_references")
    .column("entry_id")
    .execute();

  // Supports the "every miracle in Mark" / passage-lookup direction.
  await db.schema
    .createIndex("idx_jesus_entry_references_passage")
    .on("jesus_entry_references")
    .columns(["book_id", "chapter"])
    .execute();

  await db.schema
    .createIndex("idx_jesus_entry_themes_theme")
    .on("jesus_entry_themes")
    .column("theme_id")
    .execute();

  await db.schema
    .createIndex("idx_jesus_entry_explanations_entry")
    .on("jesus_entry_explanations")
    .column("entry_id")
    .execute();

  await db.schema
    .createIndex("idx_jesus_label_translations_entity")
    .on("jesus_label_translations")
    .columns(["entity_type", "entity_id", "language_code"])
    .execute();

  // One active translation per (entry, language) and one active explanation
  // per (entry, language, type) — mirrors the topics feature's guarantees so
  // the "latest active row wins" read path can never return two rows.
  await db.executeQuery(
    sql`CREATE UNIQUE INDEX unique_active_jesus_entry_translation ON jesus_entry_translations (entry_id, language_code) WHERE is_active = true`.compile(
      db,
    ),
  );

  await db.executeQuery(
    sql`CREATE UNIQUE INDEX unique_active_jesus_entry_explanation ON jesus_entry_explanations (entry_id, language_code, type) WHERE is_active = true`.compile(
      db,
    ),
  );

  await db.executeQuery(
    sql`CREATE UNIQUE INDEX unique_active_jesus_label_translation ON jesus_label_translations (entity_type, entity_id, language_code) WHERE is_active = true`.compile(
      db,
    ),
  );

  console.log("Successfully created Jesus feature tables.");
}

export async function down(db: Kysely<Database>): Promise<void> {
  console.log("Dropping Jesus feature tables...");

  await db.executeQuery(
    sql`DROP INDEX IF EXISTS unique_active_jesus_label_translation`.compile(db),
  );
  await db.executeQuery(
    sql`DROP INDEX IF EXISTS unique_active_jesus_entry_explanation`.compile(db),
  );
  await db.executeQuery(
    sql`DROP INDEX IF EXISTS unique_active_jesus_entry_translation`.compile(db),
  );

  await db.schema.dropTable("jesus_entry_explanations").ifExists().execute();
  await db.schema.dropTable("jesus_label_translations").ifExists().execute();
  await db.schema.dropTable("jesus_entry_translations").ifExists().execute();
  await db.schema.dropTable("jesus_collection_entries").ifExists().execute();
  await db.schema.dropTable("jesus_collections").ifExists().execute();
  await db.schema.dropTable("jesus_entry_themes").ifExists().execute();
  await db.schema.dropTable("jesus_entry_references").ifExists().execute();
  await db.schema.dropTable("jesus_entries").ifExists().execute();
  await db.schema.dropTable("jesus_themes").ifExists().execute();
  await db.schema.dropTable("jesus_periods").ifExists().execute();

  console.log("Successfully dropped Jesus feature tables.");
}
