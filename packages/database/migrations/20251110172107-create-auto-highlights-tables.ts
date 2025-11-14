import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

export async function up(db: Kysely<Database>): Promise<void> {
  console.log("Creating auto-highlights feature tables...");

  // Table 1: Highlight Themes (System-defined categories)
  await db.schema
    .createTable("highlight_themes")
    .addColumn("theme_id", "serial", (col) => col.primaryKey())
    .addColumn("name", "varchar(100)", (col) => col.notNull().unique())
    .addColumn("color", sql`highlight_color_enum`, (col) => col.notNull())
    .addColumn("description", "text")
    .addColumn("is_system", "boolean", (col) => col.defaultTo(true))
    .addColumn("priority", "integer", (col) => col.defaultTo(0))
    .addColumn("is_active", "boolean", (col) => col.defaultTo(true))
    .addColumn("created_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  // Table 2: Auto-generated highlights from AI
  await db.schema
    .createTable("auto_highlights")
    .addColumn("auto_highlight_id", "serial", (col) => col.primaryKey())
    .addColumn("theme_id", "integer", (col) =>
      col.references("highlight_themes.theme_id").onDelete("cascade").notNull(),
    )
    .addColumn("book_id", "integer", (col) =>
      col.references("books.book_id").onDelete("cascade").notNull(),
    )
    .addColumn("chapter_number", "integer", (col) => col.notNull())
    .addColumn("start_verse", "integer", (col) => col.notNull())
    .addColumn("end_verse", "integer", (col) => col.notNull())
    .addColumn("relevance_score", "integer", (col) => col.notNull())
    .addColumn("created_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  // Add constraints to auto_highlights
  await db.executeQuery(
    sql`ALTER TABLE auto_highlights ADD CONSTRAINT check_valid_verse_range CHECK (start_verse <= end_verse)`.compile(
      db,
    ),
  );

  await db.executeQuery(
    sql`ALTER TABLE auto_highlights ADD CONSTRAINT check_positive_verses CHECK (start_verse > 0 AND end_verse > 0)`.compile(
      db,
    ),
  );

  await db.executeQuery(
    sql`ALTER TABLE auto_highlights ADD CONSTRAINT check_relevance_range CHECK (relevance_score >= 1 AND relevance_score <= 5)`.compile(
      db,
    ),
  );

  // Indexes for auto_highlights
  await db.schema
    .createIndex("idx_auto_highlights_book_chapter")
    .on("auto_highlights")
    .columns(["book_id", "chapter_number"])
    .execute();

  await db.schema
    .createIndex("idx_auto_highlights_theme")
    .on("auto_highlights")
    .column("theme_id")
    .execute();

  await db.schema
    .createIndex("idx_auto_highlights_relevance")
    .on("auto_highlights")
    .column("relevance_score")
    .execute();

  await db.schema
    .createIndex("idx_auto_highlights_theme_book")
    .on("auto_highlights")
    .columns(["theme_id", "book_id"])
    .execute();

  // Table 3: User preferences for theme visibility
  await db.schema
    .createTable("user_theme_preferences")
    .addColumn("user_id", "uuid", (col) =>
      col.references("user.id").onDelete("cascade").notNull(),
    )
    .addColumn("theme_id", "integer", (col) =>
      col.references("highlight_themes.theme_id").onDelete("cascade").notNull(),
    )
    .addColumn("is_enabled", "boolean", (col) => col.defaultTo(true))
    .addColumn("custom_color", sql`highlight_color_enum`)
    .addColumn("relevance_threshold", "integer", (col) => col.defaultTo(3))
    .addColumn("updated_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  // Add primary key constraint
  await db.executeQuery(
    sql`ALTER TABLE user_theme_preferences ADD PRIMARY KEY (user_id, theme_id)`.compile(
      db,
    ),
  );

  // Add constraint for relevance_threshold
  await db.executeQuery(
    sql`ALTER TABLE user_theme_preferences ADD CONSTRAINT check_relevance_threshold CHECK (relevance_threshold >= 1 AND relevance_threshold <= 5)`.compile(
      db,
    ),
  );

  // Index for user_theme_preferences
  await db.schema
    .createIndex("idx_user_theme_prefs_user")
    .on("user_theme_preferences")
    .column("user_id")
    .execute();

  // Table 4: Global settings for auto-highlights
  await db.schema
    .createTable("auto_highlight_settings")
    .addColumn("setting_key", "varchar(100)", (col) => col.primaryKey())
    .addColumn("setting_value", "text", (col) => col.notNull())
    .addColumn("updated_at", "timestamp", (col) =>
      col.defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  // Insert default global relevance for logged-out users
  await db
    .insertInto("auto_highlight_settings")
    .values({
      setting_key: "default_relevance_threshold",
      setting_value: "3",
    })
    .execute();

  // Seed 6 default themes
  const defaultThemes = [
    {
      name: "Key Verses",
      color: "yellow",
      description: "Foundational truths and essential doctrine",
      priority: 1,
      is_system: true,
      is_active: true,
    },
    {
      name: "Promises from God",
      color: "blue",
      description: "Divine promises and covenants",
      priority: 2,
      is_system: true,
      is_active: true,
    },
    {
      name: "Commands",
      color: "green",
      description: "Direct commands and instructions",
      priority: 3,
      is_system: true,
      is_active: true,
    },
    {
      name: "Warnings",
      color: "orange",
      description: "Warnings, prophecies, and cautionary passages",
      priority: 4,
      is_system: true,
      is_active: true,
    },
    {
      name: "Comfort",
      color: "pink",
      description: "Comfort, encouragement, and salvation passages",
      priority: 5,
      is_system: true,
      is_active: true,
    },
    {
      name: "God's Nature",
      color: "purple",
      description: "Characteristics of God and repeating divine themes",
      priority: 6,
      is_system: true,
      is_active: true,
    },
  ];

  for (const theme of defaultThemes) {
    await db
      .insertInto("highlight_themes")
      .values(theme as any)
      .execute();
  }

  console.log(
    "Successfully created auto-highlights feature tables and seeded default themes.",
  );
}

export async function down(db: Kysely<Database>): Promise<void> {
  console.log("Dropping auto-highlights feature tables...");

  await db.schema.dropTable("user_theme_preferences").ifExists().execute();
  await db.schema.dropTable("auto_highlights").ifExists().execute();
  await db.schema.dropTable("highlight_themes").ifExists().execute();
  await db.schema.dropTable("auto_highlight_settings").ifExists().execute();

  console.log("Successfully dropped auto-highlights feature tables.");
}
