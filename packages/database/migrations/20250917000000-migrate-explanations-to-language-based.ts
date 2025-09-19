import { type Kysely, sql } from "kysely";
import type Database from "../src/models/Database";

export async function up(db: Kysely<Database>): Promise<void> {
  console.log(
    "Starting migration: Explanations to language-based architecture",
  );

  // The migrator already wraps this in a transaction

  // Step 1: Add language_code column if it doesn't exist
  console.log("Step 1: Adding language_code column to explanations table");
  try {
    await db.schema
      .alterTable("explanations")
      .addColumn("language_code", "varchar(10)")
      .execute();
  } catch (e: any) {
    if (e.message.includes("already exists")) {
      console.log("language_code column already exists, skipping.");
    } else {
      throw e;
    }
  }

  // Step 2: Populate language_code from bible_versions
  console.log("Step 2: Populating language_code from bible_versions");
  await db
    .updateTable("explanations")
    .set({
      language_code: db
        .selectFrom("bible_versions")
        .select("language_code")
        .whereRef("bible_versions.id", "=", sql`explanations.version_id`),
    })
    .where(sql`version_id`, "is not", null)
    .execute();

  // Step 3: Handle duplicates before adding NOT NULL and UNIQUE constraints
  console.log("Step 3: De-duplicating explanations");
  await db
    .deleteFrom("explanations")
    .where("explanation_id", "in", (eb) =>
      eb
        .selectFrom((eb) =>
          eb
            .selectFrom("explanations")
            .select([
              "explanation_id",
              sql<number>`ROW_NUMBER() OVER (PARTITION BY chapter_id, type, language_code, version ORDER BY created_at DESC)`.as(
                "rn",
              ),
            ])
            .as("ranked_explanations"),
        )
        .select("explanation_id")
        .where("rn", ">", 1),
    )
    .execute();

  // Step 4: Validate language_code population before applying NOT NULL constraint
  console.log("Step 4: Validating language_code population");
  const nullLanguageCodeCount = await db
    .selectFrom("explanations")
    .select((eb) => eb.fn.count("explanation_id").as("count"))
    .where("language_code", "is", null)
    .executeTakeFirst();

  if (nullLanguageCodeCount && Number(nullLanguageCodeCount.count) > 0) {
    throw new Error(
      `Migration failed: ${nullLanguageCodeCount.count} explanations still have NULL language_code. Cannot apply NOT NULL constraint safely.`,
    );
  }

  console.log(
    "Step 4b: All explanations have valid language_code, applying NOT NULL constraint",
  );
  await db.schema
    .alterTable("explanations")
    .alterColumn("language_code", (col) => col.setNotNull())
    .execute();

  // Step 5: Create new unique index for language-based explanations
  console.log("Step 5: Creating new unique index");
  await db.schema
    .createIndex("idx_explanations_chap_type_lang_version")
    .on("explanations")
    .columns(["chapter_id", "type", "language_code", "version"])
    .unique()
    .ifNotExists()
    .execute();

  // Step 6: Drop old unique constraint
  console.log("Step 6: Dropping old unique constraint");
  await db.schema
    .alterTable("explanations")
    .dropConstraint("uq_explanations_chap_type_version_version")
    .ifExists()
    .execute();

  // Step 7: Drop foreign key constraint on version_id
  console.log("Step 7: Dropping foreign key constraint on version_id");
  try {
    await db.schema
      .alterTable("explanations")
      .dropConstraint("explanations_version_id_fkey")
      .execute();
  } catch (error: any) {
    if (error.message.includes("does not exist")) {
      console.log("Foreign key constraint not found or already dropped");
    } else {
      throw error;
    }
  }

  // Step 8: Remove version_id column
  console.log("Step 8: Removing version_id column");
  try {
    await db.schema
      .alterTable("explanations")
      .dropColumn("version_id")
      .execute();
  } catch (e: any) {
    if (e.message.includes("does not exist")) {
      console.log("version_id column not found, skipping.");
    } else {
      throw e;
    }
  }

  console.log("Migration completed successfully");
}

export async function down(db: Kysely<Database>): Promise<void> {
  console.log("Starting rollback: Reverting to version-based architecture");

  // The migrator already wraps this in a transaction

  // Step 1: Add back version_id column
  console.log("Step 1: Adding back version_id column");
  try {
    await db.schema
      .alterTable("explanations")
      .addColumn("version_id", "uuid")
      .execute();
  } catch (e: any) {
    if (e.message.includes("already exists")) {
      console.log("version_id column already exists, skipping.");
    } else {
      throw e;
    }
  }

  // Step 2: Populate version_id from bible_versions
  console.log("Step 2: Populating version_id from language_code");
  await (db.updateTable("explanations") as any)
    .set({
      version_id: db
        .selectFrom("bible_versions")
        .select("id")
        .whereRef(
          "bible_versions.language_code",
          "=",
          sql`explanations.language_code`,
        )
        .limit(1),
    })
    .execute();

  // Step 3: Validate version_id population before applying NOT NULL constraint
  console.log("Step 3: Validating version_id population");
  const nullVersionIdCount = await db
    .selectFrom("explanations")
    .select((eb) => eb.fn.count("explanation_id").as("count"))
    .where(sql`explanations.version_id`, "is", null)
    .executeTakeFirst();

  if (nullVersionIdCount && Number(nullVersionIdCount.count) > 0) {
    throw new Error(
      `Rollback failed: ${nullVersionIdCount.count} explanations still have NULL version_id. Cannot apply NOT NULL constraint safely.`,
    );
  }

  console.log(
    "Step 3b: All explanations have valid version_id, applying NOT NULL constraint",
  );
  await (db.schema.alterTable("explanations") as any)
    .alterColumn("version_id", (col: any) => col.setNotNull())
    .execute();

  // Step 4: Recreate foreign key constraint
  console.log("Step 4: Recreating foreign key constraint");
  try {
    await db.schema
      .alterTable("explanations")
      .addForeignKeyConstraint(
        "explanations_version_id_fkey",
        ["version_id"],
        "bible_versions",
        ["id"],
      )
      .execute();
  } catch (e: any) {
    if (e.message.includes("already exists")) {
      console.log("Foreign key constraint already exists, skipping.");
    } else {
      throw e;
    }
  }

  // Step 5: Drop language-based unique index
  console.log("Step 5: Dropping language-based unique index");
  await db.schema
    .dropIndex("idx_explanations_chap_type_lang_version")
    .ifExists()
    .execute();

  // Step 6: Recreate old unique constraint
  console.log("Step 6: Recreating old unique constraint");
  await db.schema
    .createIndex("uq_explanations_chap_type_version_version")
    .on("explanations")
    .columns(["chapter_id", "type", "version_id", "version"])
    .unique()
    .ifNotExists()
    .execute();

  // Step 7: Remove language_code column
  console.log("Step 7: Removing language_code column");
  try {
    await db.schema
      .alterTable("explanations")
      .dropColumn("language_code")
      .execute();
  } catch (e: any) {
    if (e.message.includes("does not exist")) {
      console.log("language_code column not found, skipping.");
    } else {
      throw e;
    }
  }

  console.log("Rollback completed successfully");
}
