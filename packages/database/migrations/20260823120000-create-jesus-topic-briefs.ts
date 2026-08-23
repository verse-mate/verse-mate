import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

/**
 * Per-category topic briefs.
 *
 * The category browse groups a category's events under the themes they belong
 * to, and until now each group was described by the theme's own blurb. That
 * blurb answers "what is the Kingdom?" — the same sentence under Teachings, under
 * Miracles and under Parables — when the screen is asking "what does He *teach*
 * about the Kingdom?". A brief is that second answer: one row per
 * (facet type × theme × language).
 *
 * Shaped like `jesus_event_explanations` on purpose: same provenance column,
 * same prompt/model traceability, same "one active row per key" index. A brief
 * is generated prose about passages, so it is stored at level 2 and never at
 * level 1 — the generator enforces that, and the app hedges it accordingly.
 *
 * There is deliberately no brief for the untagged catch-all group. It is
 * whatever a category has left over, not a subject anything can be said about.
 */
export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("jesus_topic_briefs")
    .addColumn("brief_id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    // The browse category: a `JESUS_FACET_TYPES` value such as TEACHING.
    // Stored as text rather than as a foreign key because the taxonomy lives in
    // code — `jesus_facets.type` is stored the same way.
    .addColumn("facet_type", "varchar(32)", (col) => col.notNull())
    .addColumn("theme_id", "uuid", (col) =>
      col.references("jesus_themes.theme_id").onDelete("cascade").notNull(),
    )
    .addColumn("content", "text", (col) => col.notNull())
    .addColumn("language_code", "varchar(10)", (col) => col.notNull())
    .addColumn("provenance", "smallint", (col) => col.notNull().defaultTo(2))
    // Which prompt and model produced this, so a regeneration is traceable.
    .addColumn("prompt_id", "integer")
    .addColumn("model", "varchar(80)")
    .addColumn("version", "integer", (col) => col.defaultTo(1))
    .addColumn("is_active", "boolean", (col) => col.defaultTo(true))
    .addColumn("reviewed_by", "uuid")
    .addColumn("reviewed_at", "timestamp")
    .addColumn("created_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  // The read path: every brief for one category, in one language, at once.
  await db.schema
    .createIndex("idx_jesus_topic_briefs_lookup")
    .on("jesus_topic_briefs")
    .columns(["facet_type", "language_code"])
    .execute();

  // One live brief per topic per language. Superseded rows stay for history
  // with is_active = false, exactly as event explanations do.
  await db.executeQuery(
    sql`CREATE UNIQUE INDEX unique_active_jesus_topic_brief ON jesus_topic_briefs (facet_type, theme_id, language_code) WHERE is_active = true`.compile(
      db,
    ),
  );

  // Provenance is load-bearing for how the UI hedges a claim, so the database
  // refuses a value the product has no rendering for. Level 1 means "explicitly
  // present in the text", which generated prose about a passage never is.
  await db.executeQuery(
    sql`ALTER TABLE jesus_topic_briefs
        ADD CONSTRAINT jesus_topic_briefs_provenance_check
        CHECK (provenance IN (2, 3))`.compile(db),
  );
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("jesus_topic_briefs").ifExists().execute();
}
