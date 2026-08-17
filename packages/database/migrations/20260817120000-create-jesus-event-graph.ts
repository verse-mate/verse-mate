import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

/**
 * The Jesus Event Graph — see specs/jesus-event-graph.md.
 *
 * Promotes the Gospel event (pericope) to the primary object. The previous
 * model gave every row a single `kind`, which cannot express that one episode
 * is simultaneously a miracle, a question and an act of compassion — in the
 * shipped corpus, 20 `harmony_key` clusters already held more than one entry
 * for the same episode and rendered as unrelated cards.
 *
 * Here an event owns:
 *  - passages     one per Gospel that records it, in that Gospel's own order
 *  - facets       the typed things Jesus said and did, with speaker AND actor
 *  - reveals      what He says of Himself / demonstrates / others say / the
 *                 narrator says — kept apart so the Gospel writer's voice is
 *                 never merged into Jesus'
 *  - reactions, people, themes, and generated explanations
 *
 * Two hedges are first-class columns rather than prose: `chronology_confidence`
 * and `parallel_confidence`. The Synoptics sometimes arrange thematically, so a
 * harmonized sequence is a reconstruction and the UI must be able to say so.
 *
 * `jesus_entries` and friends are left in place by this migration. The data
 * migration that follows reads from them, and keeping them for a release means
 * a rollback doesn't lose the corpus.
 */
export async function up(db: Kysely<Database>): Promise<void> {
  console.log("Creating Jesus event graph...");

  // ── Events ──────────────────────────────────────────────────────────────
  await db.schema
    .createTable("jesus_events")
    .addColumn("event_id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("slug", "varchar(140)", (col) => col.notNull().unique())
    .addColumn("title", "varchar(255)", (col) => col.notNull())
    .addColumn("summary", "text")
    .addColumn("period_id", "uuid", (col) =>
      col.references("jesus_periods.period_id").onDelete("set null"),
    )
    // Harmonized sequence — a reconstruction, hence the confidence beside it.
    .addColumn("sequence", "integer")
    .addColumn("chronology_confidence", "varchar(12)", (col) =>
      col.notNull().defaultTo("probable"),
    )
    .addColumn("parallel_confidence", "varchar(12)", (col) =>
      col.notNull().defaultTo("high"),
    )
    .addColumn("location", "varchar(160)")
    .addColumn("approximate_date", "varchar(80)")
    .addColumn("is_active", "boolean", (col) => col.defaultTo(true))
    .addColumn("created_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  // ── Passages — one per Gospel account ───────────────────────────────────
  await db.schema
    .createTable("jesus_event_passages")
    .addColumn("passage_id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("event_id", "uuid", (col) =>
      col.references("jesus_events.event_id").onDelete("cascade").notNull(),
    )
    .addColumn("book_id", "integer", (col) =>
      col.references("books.book_id").notNull(),
    )
    .addColumn("chapter", "integer", (col) => col.notNull())
    .addColumn("verse_start", "integer")
    .addColumn("verse_end", "integer")
    // Where this Gospel puts the event — a fact, distinct from `sequence`.
    .addColumn("canonical_order", "integer")
    .addColumn("is_primary", "boolean", (col) => col.defaultTo(false))
    // What this account emphasizes / includes uniquely. Drives the Compare tab
    // from stored, reviewable data rather than a model call per request.
    .addColumn("emphasis", "text")
    .addColumn("unique_to_account", "text")
    .addColumn("sort_order", "integer", (col) => col.defaultTo(0))
    .addColumn("created_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  // ── Facets — the typed things Jesus said and did ────────────────────────
  await db.schema
    .createTable("jesus_facets")
    .addColumn("facet_id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("event_id", "uuid", (col) =>
      col.references("jesus_events.event_id").onDelete("cascade").notNull(),
    )
    // Slugs carry over from the previous model so existing URLs keep resolving.
    .addColumn("slug", "varchar(140)", (col) => col.notNull().unique())
    .addColumn("mode", "varchar(8)", (col) => col.notNull())
    .addColumn("type", "varchar(24)", (col) => col.notNull())
    // Tagging only `speaker` produces a red-letter list; `actor` is what
    // recovers "He stretched out His hand and touched him".
    .addColumn("speaker", "varchar(16)")
    .addColumn("actor", "varchar(16)")
    .addColumn("title", "varchar(255)", (col) => col.notNull())
    .addColumn("text", "text")
    .addColumn("summary", "text")
    .addColumn("book_id", "integer", (col) => col.references("books.book_id"))
    .addColumn("chapter", "integer")
    .addColumn("verse_start", "integer")
    .addColumn("verse_end", "integer")
    .addColumn("provenance", "smallint", (col) => col.notNull().defaultTo(1))
    .addColumn("sort_order", "integer", (col) => col.defaultTo(0))
    .addColumn("is_active", "boolean", (col) => col.defaultTo(true))
    .addColumn("created_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  // ── What the event reveals, by channel ──────────────────────────────────
  // Separating these prevents the exegetical error of putting the narrator's
  // words in Jesus' mouth — John in particular interleaves both.
  await db.schema
    .createTable("jesus_event_reveals")
    .addColumn("reveal_id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("event_id", "uuid", (col) =>
      col.references("jesus_events.event_id").onDelete("cascade").notNull(),
    )
    .addColumn("channel", "varchar(24)", (col) => col.notNull())
    .addColumn("content", "text", (col) => col.notNull())
    .addColumn("source_ref", "varchar(120)")
    .addColumn("provenance", "smallint", (col) => col.notNull().defaultTo(2))
    .addColumn("language_code", "varchar(10)", (col) =>
      col.notNull().defaultTo("en-US"),
    )
    .addColumn("sort_order", "integer", (col) => col.defaultTo(0))
    .addColumn("is_active", "boolean", (col) => col.defaultTo(true))
    .execute();

  // ── Reactions ───────────────────────────────────────────────────────────
  await db.schema
    .createTable("jesus_event_reactions")
    .addColumn("reaction_id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("event_id", "uuid", (col) =>
      col.references("jesus_events.event_id").onDelete("cascade").notNull(),
    )
    .addColumn("who", "varchar(120)", (col) => col.notNull())
    .addColumn("what", "text", (col) => col.notNull())
    .addColumn("source_ref", "varchar(120)")
    .addColumn("provenance", "smallint", (col) => col.notNull().defaultTo(1))
    .addColumn("language_code", "varchar(10)", (col) =>
      col.notNull().defaultTo("en-US"),
    )
    .addColumn("sort_order", "integer", (col) => col.defaultTo(0))
    .execute();

  // ── People / audience ───────────────────────────────────────────────────
  await db.schema
    .createTable("jesus_event_people")
    .addColumn("event_id", "uuid", (col) =>
      col.references("jesus_events.event_id").onDelete("cascade").notNull(),
    )
    .addColumn("person", "varchar(120)", (col) => col.notNull())
    .addColumn("role", "varchar(40)")
    .addPrimaryKeyConstraint("jesus_event_people_pkey", ["event_id", "person"])
    .execute();

  // ── Event ↔ theme ───────────────────────────────────────────────────────
  await db.schema
    .createTable("jesus_event_themes")
    .addColumn("event_id", "uuid", (col) =>
      col.references("jesus_events.event_id").onDelete("cascade").notNull(),
    )
    .addColumn("theme_id", "uuid", (col) =>
      col.references("jesus_themes.theme_id").onDelete("cascade").notNull(),
    )
    .addPrimaryKeyConstraint("jesus_event_themes_pkey", [
      "event_id",
      "theme_id",
    ])
    .execute();

  // ── Generated narrative content ─────────────────────────────────────────
  // `type` ∈ overview | compare | insights | application. Mirrors the
  // topic_explanations contract so the same language-fallback rules apply.
  await db.schema
    .createTable("jesus_event_explanations")
    .addColumn("explanation_id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("event_id", "uuid", (col) =>
      col.references("jesus_events.event_id").onDelete("cascade").notNull(),
    )
    .addColumn("type", "varchar(24)", (col) => col.notNull())
    .addColumn("content", "text", (col) => col.notNull())
    .addColumn("language_code", "varchar(10)", (col) => col.notNull())
    .addColumn("provenance", "smallint", (col) => col.notNull().defaultTo(2))
    // Which prompt produced this, so a regeneration is traceable.
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

  // ── Indexes ─────────────────────────────────────────────────────────────
  await db.schema
    .createIndex("idx_jesus_events_period")
    .on("jesus_events")
    .columns(["period_id", "sequence"])
    .execute();

  await db.schema
    .createIndex("idx_jesus_event_passages_event")
    .on("jesus_event_passages")
    .column("event_id")
    .execute();

  // The verse → event lookup behind "View Jesus Event". This one is on the
  // reader's hot path, so it gets a covering index on the range predicate.
  await db.schema
    .createIndex("idx_jesus_event_passages_lookup")
    .on("jesus_event_passages")
    .columns(["book_id", "chapter", "verse_start", "verse_end"])
    .execute();

  await db.schema
    .createIndex("idx_jesus_facets_event")
    .on("jesus_facets")
    .columns(["event_id", "sort_order"])
    .execute();

  await db.schema
    .createIndex("idx_jesus_facets_type")
    .on("jesus_facets")
    .columns(["type", "mode"])
    .execute();

  await db.schema
    .createIndex("idx_jesus_facets_speaker_actor")
    .on("jesus_facets")
    .columns(["speaker", "actor"])
    .execute();

  await db.schema
    .createIndex("idx_jesus_facets_passage")
    .on("jesus_facets")
    .columns(["book_id", "chapter"])
    .execute();

  await db.schema
    .createIndex("idx_jesus_event_reveals_event")
    .on("jesus_event_reveals")
    .columns(["event_id", "channel"])
    .execute();

  await db.schema
    .createIndex("idx_jesus_event_reactions_event")
    .on("jesus_event_reactions")
    .column("event_id")
    .execute();

  await db.schema
    .createIndex("idx_jesus_event_themes_theme")
    .on("jesus_event_themes")
    .column("theme_id")
    .execute();

  await db.executeQuery(
    sql`CREATE UNIQUE INDEX unique_active_jesus_event_explanation ON jesus_event_explanations (event_id, language_code, type) WHERE is_active = true`.compile(
      db,
    ),
  );

  await db.executeQuery(
    sql`CREATE UNIQUE INDEX unique_jesus_event_passage ON jesus_event_passages (event_id, book_id, chapter, COALESCE(verse_start, -1))`.compile(
      db,
    ),
  );

  // ── Value guards ────────────────────────────────────────────────────────
  // Confidence and provenance are load-bearing for how the UI hedges claims,
  // so the database refuses a value the product has no rendering for.
  await db.executeQuery(
    sql`ALTER TABLE jesus_events
        ADD CONSTRAINT jesus_events_chronology_confidence_check
        CHECK (chronology_confidence IN ('high','probable','disputed'))`.compile(
      db,
    ),
  );
  await db.executeQuery(
    sql`ALTER TABLE jesus_events
        ADD CONSTRAINT jesus_events_parallel_confidence_check
        CHECK (parallel_confidence IN ('high','probable','disputed'))`.compile(
      db,
    ),
  );
  await db.executeQuery(
    sql`ALTER TABLE jesus_facets
        ADD CONSTRAINT jesus_facets_mode_check
        CHECK (mode IN ('WORD','ACTION'))`.compile(db),
  );
  await db.executeQuery(
    sql`ALTER TABLE jesus_facets
        ADD CONSTRAINT jesus_facets_provenance_check
        CHECK (provenance BETWEEN 1 AND 3)`.compile(db),
  );
  await db.executeQuery(
    sql`ALTER TABLE jesus_event_reveals
        ADD CONSTRAINT jesus_event_reveals_channel_check
        CHECK (channel IN ('SAYS_ABOUT_HIMSELF','DEMONSTRATES','OTHERS_SAY','NARRATOR_SAYS'))`.compile(
      db,
    ),
  );

  console.log("Successfully created Jesus event graph.");
}

export async function down(db: Kysely<Database>): Promise<void> {
  console.log("Dropping Jesus event graph...");

  await db.executeQuery(
    sql`DROP INDEX IF EXISTS unique_jesus_event_passage`.compile(db),
  );
  await db.executeQuery(
    sql`DROP INDEX IF EXISTS unique_active_jesus_event_explanation`.compile(db),
  );

  await db.schema.dropTable("jesus_event_explanations").ifExists().execute();
  await db.schema.dropTable("jesus_event_themes").ifExists().execute();
  await db.schema.dropTable("jesus_event_people").ifExists().execute();
  await db.schema.dropTable("jesus_event_reactions").ifExists().execute();
  await db.schema.dropTable("jesus_event_reveals").ifExists().execute();
  await db.schema.dropTable("jesus_facets").ifExists().execute();
  await db.schema.dropTable("jesus_event_passages").ifExists().execute();
  await db.schema.dropTable("jesus_events").ifExists().execute();

  console.log("Successfully dropped Jesus event graph.");
}
