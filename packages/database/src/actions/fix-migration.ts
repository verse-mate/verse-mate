import { db } from "../database";

const MIGRATION_NAME = process.argv[2] || process.env.MIGRATION_NAME;

async function fixCorruptedMigration() {
  if (!MIGRATION_NAME) {
    console.error(
      "Missing migration name. Provide as CLI arg or MIGRATION_NAME env.",
    );
    process.exit(1);
  }

  console.log(
    `Attempting to fix corrupted migrations by deleting entry for ${MIGRATION_NAME}`,
  );

  try {
    const result = await db
      .getOrCreateConnection()
      .deleteFrom("kysely_migration")
      .where("name", "=", MIGRATION_NAME)
      .executeTakeFirst();

    const deleted = Number(result?.numDeletedRows ?? 0);
    if (deleted > 0) {
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
