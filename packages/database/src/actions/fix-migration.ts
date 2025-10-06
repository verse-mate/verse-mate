import { db } from "database";

const MIGRATION_NAME = "20251006190000-fix-corrupted-migration"; //change name for desired migration

async function fixCorruptedMigration() {
  console.log(
    `Attempting to fix corrupted migrations by deleting entry for ${MIGRATION_NAME}`,
  );

  try {
    const result = await db
      .getOrCreateConnection()
      .deleteFrom("kysely_migration")
      .where("name", "=", MIGRATION_NAME)
      .executeTakeFirst();

    if (result.numDeletedRows > 0) {
      console.log(`Successfully deleted migration entry for ${MIGRATION_NAME}`);
    } else {
      console.log(
        `Migration entry for ${MIGRATION_NAME} not found. It may have been deleted already.`,
      );
    }
  } catch (error) {
    console.error("Failed to fix corrupted migrations:", error);
    process.exit(1);
  } finally {
    await db.closeConnection();
  }
}

fixCorruptedMigration();
